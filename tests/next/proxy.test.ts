import { describe, expect, it, vi } from "vitest";

import { normalizeOptions } from "../../src/shared/providers";
import { createSessionArtifacts } from "../../src/shared/session";

vi.mock("next/server", () => ({
  NextResponse: {
    next() {
      return new Response(null, { status: 200 });
    },
    redirect(url: string | URL) {
      return new Response(null, {
        status: 307,
        headers: { location: String(url) }
      });
    }
  }
}));

function makeRequest(url: string, init?: { accept?: string; cookie?: string }) {
  const headers = new Headers();
  if (init?.accept) {
    headers.set("accept", init.accept);
  }
  if (init?.cookie) {
    headers.set("cookie", init.cookie);
  }

  return {
    url,
    headers,
    cookies: {
      get(name: string) {
        const cookieHeader = headers.get("cookie");
        if (!cookieHeader) {
          return undefined;
        }

        for (const part of cookieHeader.split(/;\s*/)) {
          const [key, ...rest] = part.split("=");
          if (key === name) {
            return {
              value: decodeURIComponent(rest.join("="))
            };
          }
        }

        return undefined;
      }
    },
    nextUrl: new URL(url)
  } as never;
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(/,(?=[^;]+=[^;]+)/) : [];
}

describe("withAuth", () => {
  it("validates a valid JWT, exposes req.auth, and writes no cookies", async () => {
    const authOptions = {
      secret: "proxy-secret",
      providers: []
    };
    const normalized = normalizeOptions(authOptions);
    const { sessionToken } = await createSessionArtifacts(
      { email: "ada@example.com" },
      "email",
      normalized,
      "ada@example.com"
    );

    const { withAuth } = await import("../../src/next/proxy");
    const handler = vi.fn(() => undefined);
    const proxy = withAuth(authOptions, handler);

    const response = await proxy(
      makeRequest("https://app.example.com/dashboard", {
        accept: "text/html",
        cookie: `za.session=${encodeURIComponent(sessionToken)}`
      })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const handledRequest = (handler.mock.calls as unknown[][])[0]?.[0] as
      | { auth: { isValid: boolean; user?: { email?: string } } }
      | undefined;
    expect(handledRequest?.auth.isValid).toBe(true);
    expect(handledRequest?.auth.user?.email).toBe("ada@example.com");
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("passes through with an invalid req.auth when the JWT is invalid", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const handler = vi.fn(() => undefined);
    const proxy = withAuth(
      {
        secret: "proxy-secret",
        providers: []
      },
      handler
    );

    const response = await proxy(
      makeRequest("https://app.example.com/dashboard", {
        cookie: "za.session=invalid-token"
      })
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const handledRequest = (handler.mock.calls as unknown[][])[0]?.[0] as
      | { auth: { isValid: boolean } }
      | undefined;
    expect(handledRequest?.auth.isValid).toBe(false);
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("redirects HTML requests to the sign-in page when authorization fails", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth(
      {
        secret: "proxy-secret",
        providers: []
      },
      undefined,
      {
        pages: {
          signIn: "/signin"
        },
        callbacks: {
          authorized: ({ session }) => session.isValid
        }
      }
    );

    const response = await proxy(
      makeRequest("https://app.example.com/dashboard?tab=private", {
        accept: "text/html"
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/signin?callbackUrl=%2Fdashboard%3Ftab%3Dprivate"
    );
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("returns 401 for non-HTML requests when authorization fails", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth(
      {
        secret: "proxy-secret",
        providers: []
      },
      undefined,
      {
        callbacks: {
          authorized: () => false
        }
      }
    );

    const response = await proxy(makeRequest("https://app.example.com/dashboard"));
    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe("Unauthorized");
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("supports custom authorization responses", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth(
      {
        secret: "proxy-secret",
        providers: []
      },
      undefined,
      {
        callbacks: {
          authorized: () => new Response("blocked", { status: 418 })
        }
      }
    );

    const response = await proxy(makeRequest("https://app.example.com/dashboard"));
    expect(response.status).toBe(418);
    await expect(response.text()).resolves.toBe("blocked");
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("does not write any cookies when only a stale snapshot cookie is present", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth({
      secret: "proxy-secret",
      providers: []
    });

    const response = await proxy(
      makeRequest("https://app.example.com/dashboard", {
        cookie: "za.snapshot=stale"
      })
    );

    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("returns the optional handler's Response verbatim", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth(
      { secret: "proxy-secret", providers: [] },
      () => new Response("hello", { status: 201 })
    );

    const response = await proxy(makeRequest("https://app.example.com/dashboard"));
    expect(response.status).toBe(201);
    await expect(response.text()).resolves.toBe("hello");
  });
});
