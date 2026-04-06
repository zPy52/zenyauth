import type {
  SessionSnapshot,
  SessionSnapshotJson,
  SignInResult
} from "../shared/types";
import { deserializeSnapshot, serializeSnapshot } from "../shared/session";
import { DEFAULT_BASE_PATH, createInvalidSnapshot } from "../shared/utils";

type Listener = () => void;

type HydratableSnapshot<TUser> = SessionSnapshot<TUser> | SessionSnapshotJson<TUser> | null | undefined;

type SyncMessage =
  | {
      type: "hydrate";
      snapshot: SessionSnapshotJson<unknown>;
    }
  | {
      type: "clear";
    };

type InternalState = {
  snapshot: SessionSnapshot<unknown>;
  hydrated: boolean;
  api: string;
  listeners: Set<Listener>;
  expiryTimer: ReturnType<typeof setTimeout> | undefined;
  channel: BroadcastChannel | undefined;
};

const state: InternalState = {
  snapshot: createInvalidSnapshot(),
  hydrated: false,
  api: DEFAULT_BASE_PATH,
  listeners: new Set(),
  expiryTimer: undefined,
  channel: undefined
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function notify(): void {
  for (const listener of state.listeners) {
    listener();
  }
}

function snapshotKey(snapshot: SessionSnapshot<unknown>): string {
  return JSON.stringify(serializeSnapshot(snapshot));
}

function normalizeSnapshot<TUser>(snapshot: HydratableSnapshot<TUser>): SessionSnapshot<TUser> {
  if (!snapshot) {
    return createInvalidSnapshot<TUser>();
  }

  if (snapshot.expiryDate instanceof Date || snapshot.expiryDate === undefined) {
    return snapshot as SessionSnapshot<TUser>;
  }

  return deserializeSnapshot(snapshot as SessionSnapshotJson<TUser>);
}

function scheduleExpiry(snapshot: SessionSnapshot<unknown>): void {
  if (state.expiryTimer) {
    clearTimeout(state.expiryTimer);
    state.expiryTimer = undefined;
  }

  if (!snapshot.expiryDate) {
    return;
  }

  const delay = snapshot.expiryDate.getTime() - Date.now();
  if (delay <= 0) {
    state.snapshot = {
      user: undefined,
      expiryDate: snapshot.expiryDate,
      isExpired: true,
      isValid: false
    };
    return;
  }

  state.expiryTimer = setTimeout(() => {
    state.snapshot = {
      user: undefined,
      expiryDate: snapshot.expiryDate,
      isExpired: true,
      isValid: false
    };
    notify();
  }, delay);
}

function applySnapshot(snapshot: SessionSnapshot<unknown>, options?: { notifyPeers?: boolean }): void {
  const next = normalizeSnapshot(snapshot);
  const changed = !state.hydrated || snapshotKey(state.snapshot) !== snapshotKey(next);

  state.snapshot = next;
  state.hydrated = true;
  scheduleExpiry(next);

  if (options?.notifyPeers) {
    notifyPeerTabs({
      type: "hydrate",
      snapshot: serializeSnapshot(next)
    });
  }

  if (changed) {
    notify();
  }
}

function clearSnapshot(options?: { notifyPeers?: boolean }): void {
  const next = createInvalidSnapshot<unknown>();
  const changed = !state.hydrated || snapshotKey(state.snapshot) !== snapshotKey(next);

  state.snapshot = next;
  state.hydrated = true;
  scheduleExpiry(next);

  if (options?.notifyPeers) {
    notifyPeerTabs({ type: "clear" });
  }

  if (changed) {
    notify();
  }
}

function handleSyncMessage(message: SyncMessage | undefined): void {
  if (!message) {
    return;
  }

  if (message.type === "hydrate") {
    applySnapshot(deserializeSnapshot(message.snapshot));
    return;
  }

  clearSnapshot();
}

function ensureRuntime(): void {
  if (!isBrowser()) {
    return;
  }

  if (!state.channel && typeof BroadcastChannel !== "undefined") {
    state.channel = new BroadcastChannel("zenyauth");
    state.channel.onmessage = (event) => {
      handleSyncMessage(event.data as SyncMessage | undefined);
    };
  }
}

function notifyPeerTabs(message: SyncMessage): void {
  if (!isBrowser()) {
    return;
  }

  try {
    state.channel?.postMessage(message);
  } catch {
    // Ignore BroadcastChannel failures.
  }
}

async function parseResult(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function configureApi(api?: string): void {
  if (typeof api === "string" && api.trim()) {
    state.api = api.startsWith("/") ? api.replace(/\/+$/, "") : `/${api.replace(/\/+$/, "")}`;
  }
}

function readSessionResult(result: Record<string, unknown>): SessionSnapshotJson<unknown> | undefined {
  if (typeof result.session !== "object" || result.session === null) {
    return undefined;
  }

  const snapshot = result.session as Partial<SessionSnapshotJson<unknown>>;
  return {
    user: snapshot.user,
    expiryDate: typeof snapshot.expiryDate === "string" ? snapshot.expiryDate : undefined,
    isExpired: snapshot.isExpired === true,
    isValid: snapshot.isValid === true
  };
}

export function getSnapshot<TUser = unknown>(): SessionSnapshot<TUser> {
  ensureRuntime();
  return state.snapshot as SessionSnapshot<TUser>;
}

export function subscribe(listener: Listener): () => void {
  ensureRuntime();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

export function configureStore(api?: string): void {
  configureApi(api);
  ensureRuntime();
}

export function hydrateSnapshot<TUser = unknown>(snapshot: HydratableSnapshot<TUser>, options?: { notifyPeers?: boolean }): void {
  if (!isBrowser()) {
    return;
  }

  ensureRuntime();
  applySnapshot(normalizeSnapshot(snapshot) as SessionSnapshot<unknown>, options);
}

export function clearHydratedSnapshot(options?: { notifyPeers?: boolean }): void {
  if (!isBrowser()) {
    return;
  }

  ensureRuntime();
  clearSnapshot(options);
}

export class ClientSession {
  static get user(): unknown | undefined {
    return getSnapshot().user;
  }

  static get expiryDate(): Date | undefined {
    return getSnapshot().expiryDate;
  }

  static get isExpired(): boolean {
    return getSnapshot().isExpired;
  }

  static get isValid(): boolean {
    return getSnapshot().isValid;
  }

  static snapshot<TUser = unknown>(): SessionSnapshot<TUser> {
    return getSnapshot<TUser>();
  }

  static subscribe(listener: Listener): () => void {
    return subscribe(listener);
  }

  static hydrate<TUser = unknown>(snapshot: HydratableSnapshot<TUser>): void {
    hydrateSnapshot(snapshot);
  }

  static clear(): void {
    clearHydratedSnapshot();
  }

  static async signIn(provider: string, options?: Record<string, unknown>): Promise<SignInResult> {
    ensureRuntime();
    configureApi(typeof options?.api === "string" ? options.api : undefined);

    if (provider === "email") {
      const response = await fetch(`${state.api}/signin/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(options ?? {})
      });
      const result = await parseResult(response);

      if (!response.ok) {
        return {
          ok: false,
          error: typeof result.error === "string" ? result.error : "Email sign-in failed."
        };
      }

      const session = readSessionResult(result);
      if (session) {
        hydrateSnapshot(session, { notifyPeers: true });
      }

      if (typeof options?.callbackUrl === "string") {
        window.location.assign(options.callbackUrl);
      }

      return {
        ok: true,
        redirected: false
      };
    }

    const url = new URL(`${window.location.origin}${state.api}/signin/${provider}`);
    if (typeof options?.callbackUrl === "string") {
      url.searchParams.set("callbackUrl", options.callbackUrl);
    }
    window.location.assign(url.toString());
    return {
      ok: true,
      redirected: true
    };
  }

  static async signOut(options?: { callbackUrl?: string; api?: string }): Promise<void> {
    ensureRuntime();
    configureApi(options?.api);
    await fetch(`${state.api}/signout`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(options ?? {})
    });
    clearHydratedSnapshot({ notifyPeers: true });
    if (options?.callbackUrl) {
      window.location.assign(options.callbackUrl);
    }
  }
}
