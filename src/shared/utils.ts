export const DEFAULT_BASE_PATH = "/api/auth";
export const DEFAULT_COOKIE_PREFIX = "za";
export const DEFAULT_MAX_AGE = 60 * 60 * 24 * 30;

export function normalizeBasePath(path?: string): string {
  const value = path?.trim() || DEFAULT_BASE_PATH;
  if (value === "/") {
    return value;
  }

  return value.startsWith("/") ? value.replace(/\/+$/, "") : `/${value.replace(/\/+$/, "")}`;
}

export function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function toExpiryDate(exp?: number): Date | undefined {
  if (!exp) {
    return undefined;
  }

  return new Date(exp * 1000);
}

export function createInvalidSnapshot<TUser>(): import("./types").SessionSnapshot<TUser> {
  return {
    user: undefined,
    expiryDate: undefined,
    isExpired: false,
    isValid: false
  };
}

export function buildUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

export function readJwtPayload<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
    const json = Buffer.from(`${normalized}${padding}`, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function parseJsonBody(text: string): Record<string, unknown> {
  if (!text.trim()) {
    return {};
  }

  const parsed = JSON.parse(text) as unknown;
  return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
}

export function toFormRecord(data: FormData): Record<string, unknown> {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of data.entries()) {
    entries[key] = value;
  }
  return entries;
}

export function resolveRequestOrigin(req: Request): string {
  return new URL(req.url).origin;
}

export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function redirectResponse(url: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("location", url);
  return new Response(null, {
    ...init,
    status: init?.status ?? 302,
    headers
  });
}

export function wantsHtml(req: Request): boolean {
  return (req.headers.get("accept") || "").includes("text/html");
}

export function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
