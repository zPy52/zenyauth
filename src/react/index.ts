"use client";

import type { Context, ReactNode } from "react";
import { createContext, createElement, useContext, useEffect, useRef, useSyncExternalStore } from "react";

import type {
  AuthConfig,
  DefaultUser,
  InferAuthUser,
  ProviderUserPayload,
  SessionState,
  SessionSnapshot,
  SessionSnapshotJson
} from "../shared/types";
import { decodeSnapshotValue, deserializeSnapshot, getCookieNames } from "../shared/session";
import { parseCookieHeader } from "../shared/cookies";
import { DEFAULT_COOKIE_PREFIX, createInvalidSnapshot } from "../shared/utils";
import { ClientSession, configureStore, hydrateSnapshot, revalidateSession } from "./store";

export type User = DefaultUser;

type SessionProviderProps<TUser> = {
  children: ReactNode;
  initialSnapshot?: SessionSnapshot<TUser> | SessionSnapshotJson<TUser> | null;
  api?: string;
  cookiePrefix?: string;
};

type UseSessionOptions = {
  api?: string;
};

type SessionContextValue = SessionSnapshot<unknown> | null;

const SessionContext = createContext<SessionContextValue>(null);

function toSnapshot<TUser>(snapshot?: SessionSnapshot<TUser> | SessionSnapshotJson<TUser> | null): SessionSnapshot<TUser> {
  if (!snapshot) {
    return createInvalidSnapshot<TUser>();
  }

  if (snapshot.expiryDate instanceof Date || snapshot.expiryDate === undefined) {
    return snapshot as SessionSnapshot<TUser>;
  }

  return deserializeSnapshot(snapshot as SessionSnapshotJson<TUser>);
}

function readSnapshotCookie<TUser>(cookiePrefix?: string): SessionSnapshot<TUser> {
  if (typeof document === "undefined") {
    return createInvalidSnapshot<TUser>();
  }

  const cookies = parseCookieHeader(document.cookie);
  return decodeSnapshotValue<TUser>(cookies[getCookieNames(cookiePrefix ?? DEFAULT_COOKIE_PREFIX).snapshot]);
}

function isExpiredByDate(snapshot: SessionSnapshot<unknown>): boolean {
  if (!snapshot.expiryDate) {
    return false;
  }
  return snapshot.expiryDate.getTime() <= Date.now();
}

function SessionProviderBase<TUser>({
  children,
  initialSnapshot,
  api,
  cookiePrefix,
  context
}: SessionProviderProps<TUser> & {
  context: Context<SessionContextValue>;
}) {
  configureStore(api);
  const cookieSnapshotRef = useRef<SessionSnapshot<unknown> | undefined>(undefined);
  const snapshot =
    initialSnapshot !== undefined
      ? (toSnapshot(initialSnapshot) as SessionSnapshot<unknown>)
      : (cookieSnapshotRef.current ??= readSnapshotCookie<unknown>(cookiePrefix));

  hydrateSnapshot(snapshot);

  useEffect(() => {
    const stale = !snapshot.isValid || snapshot.isExpired || isExpiredByDate(snapshot);
    if (stale) {
      void revalidateSession();
    }
    // Mount-only: subsequent updates flow through the store + BroadcastChannel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createElement(context.Provider, { value: snapshot }, children);
}

function useSessionBase<TUser>(
  context: Context<SessionContextValue>,
  options?: UseSessionOptions
): SessionState<TUser> {
  configureStore(options?.api);
  const serverSnapshot = (useContext(context) as SessionSnapshot<TUser> | null) ?? createInvalidSnapshot<TUser>();
  const snapshot = useSyncExternalStore(
    ClientSession.subscribe,
    () => ClientSession.snapshot<TUser>(),
    () => serverSnapshot
  );

  return {
    ...snapshot,
    signIn(provider, signInOptions) {
      return ClientSession.signIn(provider, signInOptions);
    },
    signOut(signOutOptions) {
      return ClientSession.signOut(signOutOptions);
    }
  };
}

function createSessionAccess<TUser>() {
  return class SessionAccess {
    static get user(): TUser | undefined {
      return ClientSession.user as TUser | undefined;
    }

    static get expiryDate(): Date | undefined {
      return ClientSession.expiryDate;
    }

    static get isExpired(): boolean {
      return ClientSession.isExpired;
    }

    static get isValid(): boolean {
      return ClientSession.isValid;
    }

    static signIn(provider: string, options?: Record<string, unknown>) {
      return ClientSession.signIn(provider, options);
    }

    static signOut(options?: { callbackUrl?: string; api?: string }) {
      return ClientSession.signOut(options);
    }

    static snapshot(): SessionSnapshot<TUser> {
      return ClientSession.snapshot<TUser>();
    }

    static subscribe(listener: () => void) {
      return ClientSession.subscribe(listener);
    }
  };
}

export type ReactAuth<TUser> = {
  SessionProvider: (props: SessionProviderProps<TUser>) => ReturnType<typeof createElement>;
  useSession: (options?: UseSessionOptions) => SessionState<TUser>;
  Session: ReturnType<typeof createSessionAccess<TUser>>;
};

export function SessionProvider<TUser = DefaultUser>(props: SessionProviderProps<TUser>) {
  return SessionProviderBase({
    ...props,
    context: SessionContext
  });
}

export function useSession<TUser = DefaultUser>(options?: UseSessionOptions): SessionState<TUser> {
  return useSessionBase(SessionContext, options);
}

export function createReactAuth<TAuth extends AuthConfig<any> = AuthConfig<ProviderUserPayload>>(
  _auth?: TAuth
): ReactAuth<InferAuthUser<TAuth>> {
  type TUser = InferAuthUser<TAuth>;

  const TypedSessionContext = createContext<SessionContextValue>(null);

  return {
    SessionProvider(props) {
      return SessionProviderBase<TUser>({
        ...props,
        context: TypedSessionContext
      });
    },
    useSession(options) {
      return useSessionBase<TUser>(TypedSessionContext, options);
    },
    Session: createSessionAccess<TUser>()
  };
}

export class Session {
  static get user(): DefaultUser | undefined {
    return ClientSession.user as DefaultUser | undefined;
  }

  static get expiryDate(): Date | undefined {
    return ClientSession.expiryDate;
  }

  static get isExpired(): boolean {
    return ClientSession.isExpired;
  }

  static get isValid(): boolean {
    return ClientSession.isValid;
  }

  static signIn(provider: string, options?: Record<string, unknown>) {
    return ClientSession.signIn(provider, options);
  }

  static signOut(options?: { callbackUrl?: string; api?: string }) {
    return ClientSession.signOut(options);
  }

  static snapshot<TUser = DefaultUser>() {
    return ClientSession.snapshot<TUser>();
  }

  static subscribe(listener: () => void) {
    return ClientSession.subscribe(listener);
  }
}

export type {
  AuthConfig,
  DefaultUser,
  InferAuthUser,
  SessionSnapshot,
  SessionSnapshotJson,
  SessionState,
  SignInResult
} from "../shared/types";
