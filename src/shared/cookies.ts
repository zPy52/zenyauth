export type CookieOptions = {
  httpOnly?: boolean;
  maxAge?: number;
  path?: string;
  sameSite?: "lax" | "strict" | "none";
  secure?: boolean;
};

export function parseCookieHeader(header: string | null | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return header.split(/;\s*/).reduce<Record<string, string>>((acc, part) => {
    const index = part.indexOf("=");
    if (index <= 0) {
      return acc;
    }

    const key = decodeURIComponent(part.slice(0, index));
    const value = decodeURIComponent(part.slice(index + 1));
    acc[key] = value;
    return acc;
  }, {});
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  parts.push(`Path=${options.path ?? "/"}`);

  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  return parts.join("; ");
}

export function expireCookie(name: string, options: CookieOptions = {}): string {
  return serializeCookie(name, "", {
    ...options,
    maxAge: 0
  });
}
