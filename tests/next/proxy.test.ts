import { describe, expect, it, vi } from "vitest";

import { normalizeOptions } from "../../src/shared/providers";
import {
  SESSION_HEADER_NAME,
  createSessionArtifacts,
  decodeSnapshotHeader
} from "../../src/shared/session";

vi.mock("next/server", () => ({
  NextResponse: {
    next(init?: { request?: { headers?: Headers } }) {
      const headers = new Headers();
      const sessionHeader = init?.request?.headers?.get(SESSION_HEADER_NAME);
      if (sessionHeader) {
        headers.set(SESSION_HEADER_NAME, sessionHeader);
      }
      return new Response(null, {
        status: 200,
        headers
      });
    },
    redirect(url: string | URL) {
      return new Response(null, {
        status: 307,
        headers: {
          location: String(url)
        }
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
  it("validates the session, exposes req.auth, and injects the snapshot header", async () => {
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
      | { auth: { user?: { email?: string } } }
      | undefined;
    expect(handledRequest?.auth.user?.email).toBe("ada@example.com");

    const injected = decodeSnapshotHeader<{ email: string }>(response.headers.get(SESSION_HEADER_NAME));
    expect(injected.isValid).toBe(true);
    expect(injected.user?.email).toBe("ada@example.com");
  });

  it("clears invalid cookies and injects an invalid snapshot", async () => {
    const { withAuth } = await import("../../src/next/proxy");
    const proxy = withAuth({
      secret: "proxy-secret",
      providers: []
    });

    const response = await proxy(
      makeRequest("https://app.example.com/dashboard", {
        cookie: "za.session=invalid-token"
      })
    );

    const injected = decodeSnapshotHeader(response.headers.get(SESSION_HEADER_NAME));
    expect(injected.isValid).toBe(false);

    const cookies = getSetCookies(response);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).toContain("za.session=");
    expect(cookies[0]).toContain("Max-Age=0");
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
  });
});
