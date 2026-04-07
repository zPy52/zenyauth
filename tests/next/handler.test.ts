import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { OAuthProvider, ZenyAuthOptions } from "../../src/shared/types";
import EmailProvider from "../../src/providers/email";
import GoogleProvider from "../../src/providers/google";
import { NextZenyAuth, getServerSession } from "../../src/next/handler";

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const raw = response.headers.get("set-cookie");
  return raw ? raw.split(/,(?=[^;]+=[^;]+)/) : [];
}

function makeContext(segments: string[]) {
  return {
    params: Promise.resolve({
      zenyauth: segments
    })
  };
}

const typedAuthOptions = {
  secret: "typecheck-secret",
  providers: [],
  callbacks: {
    async signIn({ req, provider, user }) {
      expectTypeOf(req).toEqualTypeOf<Request>();
      expectTypeOf(provider).toEqualTypeOf<string>();
      expectTypeOf(user.email).toEqualTypeOf<string>();
      return undefined;
    }
  }
} satisfies ZenyAuthOptions;

function makeOAuthProvider(): OAuthProvider {
  return {
    id: "testoauth",
    name: "Test OAuth",
    type: "oauth",
    clientId: "client-id",
    clientSecret: "client-secret",
    authorizationUrl: "https://oauth.example.com/authorize",
    tokenUrl: "https://oauth.example.com/token",
    userInfoUrl: "https://oauth.example.com/userinfo",
    scope: ["openid", "email"],
    checks: ["state", "pkce"],
    profile: ({ profile }) => {
      const payload = profile as { sub: string; email: string; name?: string };
      return {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        raw: payload
      };
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("NextZenyAuth", () => {
  const authOptions: ZenyAuthOptions = {
    secret: "integration-secret",
    providers: [
      GoogleProvider({
        clientId: "google-id",
        clientSecret: "google-secret"
      }),
      EmailProvider({
        authorize: async (credentials) => {
          if (credentials.email === "ada@example.com" && credentials.password === "pass123") {
            return {
              email: "ada@example.com",
              name: "Ada"
            };
          }

          return null;
        }
      })
    ]
  };

  it("returns provider metadata", async () => {
    const handler = NextZenyAuth(authOptions);
    const response = await handler.GET(
      new Request("https://app.example.com/api/auth/providers"),
      makeContext(["providers"])
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      providers: [
        { id: "google", name: "Google", type: "oauth" },
        { id: "email", name: "Email", type: "email" }
      ]
    });
  });

  it("starts oauth sign-in with a catch-all route redirect", async () => {
    const handler = NextZenyAuth(authOptions);
    const response = await handler.GET(
      new Request("https://app.example.com/api/auth/signin/google?callbackUrl=%2Fdashboard"),
      makeContext(["signin", "google"])
    );

    expect(response.status).toBe(302);
    const location = response.headers.get("location");
    expect(location).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(location).toContain(encodeURIComponent("https://app.example.com/api/auth/callback/google"));
    expect(getSetCookies(response).some((cookie) => cookie.includes("za.flow.google"))).toBe(true);
  });

  it("signs in email users and exposes the session server-side", async () => {
    const handler = NextZenyAuth(authOptions);
    const response = await handler.POST(
      new Request("https://app.example.com/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "pass123"
        })
      }),
      makeContext(["signin", "email"])
    );

    expect(response.status).toBe(200);
    const cookies = getSetCookies(response);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[1]).toContain("za.snapshot=");
    expect(cookies[1]).not.toContain("HttpOnly");

    const session = await getServerSession(
      new Request("https://app.example.com/protected", {
        headers: {
          cookie: cookies
            .map((cookie) => cookie.split(";")[0])
            .join("; ")
        }
      }),
      authOptions
    );

    expect(session.isValid).toBe(true);
    expect(session.user?.email).toBe("ada@example.com");
  });

  it("runs callbacks.signIn for email sign-in before creating the session", async () => {
    const signIn = vi.fn(async () => undefined);
    const handler = NextZenyAuth({
      ...authOptions,
      callbacks: {
        signIn
      }
    });

    const response = await handler.POST(
      new Request("https://app.example.com/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "pass123"
        })
      }),
      makeContext(["signin", "email"])
    );

    expect(response.status).toBe(200);
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({
      req: expect.any(Request),
      provider: "email",
      user: {
        email: "ada@example.com",
        name: "Ada"
      }
    });
    expect(getSetCookies(response).some((cookie) => cookie.startsWith("za.session="))).toBe(true);
    expect(getSetCookies(response).some((cookie) => cookie.startsWith("za.snapshot="))).toBe(true);
  });

  it("fails sign-in when callbacks.signIn throws for email sign-in", async () => {
    const handler = NextZenyAuth({
      ...authOptions,
      callbacks: {
        signIn: async () => {
          throw new Error("DynamoDB write failed.");
        }
      }
    });

    const response = await handler.POST(
      new Request("https://app.example.com/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "pass123"
        })
      }),
      makeContext(["signin", "email"])
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "DynamoDB write failed."
    });
    expect(getSetCookies(response)).toHaveLength(0);
  });

  it("completes an oauth callback and redirects back to the callback url", async () => {
    const provider = makeOAuthProvider();
    const handler = NextZenyAuth({
      secret: "oauth-secret",
      providers: [provider]
    });

    const signInResponse = await handler.GET(
      new Request("https://app.example.com/api/auth/signin/testoauth?callbackUrl=%2Fprivate"),
      makeContext(["signin", "testoauth"])
    );
    const flowCookie = getSetCookies(signInResponse)
      .find((cookie) => cookie.startsWith("za.flow.testoauth="))
      ?.split(";")[0];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "access-token",
              token_type: "Bearer"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: "user-1",
              email: "user@example.com",
              name: "User"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
    );

    const signInLocation = signInResponse.headers.get("location");
    expect(signInLocation).toContain("oauth.example.com/authorize");
    const state = new URL(signInLocation || "").searchParams.get("state");
    expect(state).toBeTruthy();

    const callbackResponse = await handler.GET(
      new Request(`https://app.example.com/api/auth/callback/testoauth?code=test-code&state=${state}`, {
        headers: {
          cookie: flowCookie ?? ""
        }
      }),
      makeContext(["callback", "testoauth"])
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/private");
    expect(getSetCookies(callbackResponse).some((cookie) => cookie.startsWith("za.session="))).toBe(true);
    expect(getSetCookies(callbackResponse).some((cookie) => cookie.startsWith("za.snapshot="))).toBe(true);
  });

  it("runs callbacks.signIn for oauth callback before redirecting", async () => {
    const signIn = vi.fn(async () => undefined);
    const provider = makeOAuthProvider();
    const handler = NextZenyAuth({
      secret: "oauth-secret",
      providers: [provider],
      callbacks: {
        signIn
      }
    });

    const signInResponse = await handler.GET(
      new Request("https://app.example.com/api/auth/signin/testoauth?callbackUrl=%2Fprivate"),
      makeContext(["signin", "testoauth"])
    );
    const flowCookie = getSetCookies(signInResponse)
      .find((cookie) => cookie.startsWith("za.flow.testoauth="))
      ?.split(";")[0];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "access-token",
              token_type: "Bearer"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: "user-1",
              email: "user@example.com",
              name: "User"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
    );

    const state = new URL(signInResponse.headers.get("location") || "").searchParams.get("state");
    const callbackResponse = await handler.GET(
      new Request(`https://app.example.com/api/auth/callback/testoauth?code=test-code&state=${state}`, {
        headers: {
          cookie: flowCookie ?? ""
        }
      }),
      makeContext(["callback", "testoauth"])
    );

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe("/private");
    expect(signIn).toHaveBeenCalledTimes(1);
    expect(signIn).toHaveBeenCalledWith({
      req: expect.any(Request),
      provider: "testoauth",
      user: {
        id: "user-1",
        email: "user@example.com",
        name: "User",
        raw: {
          sub: "user-1",
          email: "user@example.com",
          name: "User"
        }
      }
    });
  });

  it("fails oauth callback and clears flow/auth cookies when callbacks.signIn throws", async () => {
    const provider = makeOAuthProvider();
    const handler = NextZenyAuth({
      secret: "oauth-secret",
      providers: [provider],
      callbacks: {
        signIn: async () => {
          throw new Error("DynamoDB write failed.");
        }
      }
    });

    const signInResponse = await handler.GET(
      new Request("https://app.example.com/api/auth/signin/testoauth?callbackUrl=%2Fprivate"),
      makeContext(["signin", "testoauth"])
    );
    const flowCookie = getSetCookies(signInResponse)
      .find((cookie) => cookie.startsWith("za.flow.testoauth="))
      ?.split(";")[0];

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              access_token: "access-token",
              token_type: "Bearer"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              sub: "user-1",
              email: "user@example.com",
              name: "User"
            }),
            {
              status: 200,
              headers: {
                "content-type": "application/json"
              }
            }
          )
        )
    );

    const state = new URL(signInResponse.headers.get("location") || "").searchParams.get("state");
    const callbackResponse = await handler.GET(
      new Request(`https://app.example.com/api/auth/callback/testoauth?code=test-code&state=${state}`, {
        headers: {
          cookie: flowCookie ?? ""
        }
      }),
      makeContext(["callback", "testoauth"])
    );

    expect(callbackResponse.status).toBe(500);
    await expect(callbackResponse.json()).resolves.toEqual({
      error: "DynamoDB write failed."
    });

    const cookies = getSetCookies(callbackResponse);
    expect(cookies.some((cookie) => cookie.startsWith("za.flow.testoauth=") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("za.session=") && cookie.includes("Max-Age=0"))).toBe(true);
    expect(cookies.some((cookie) => cookie.startsWith("za.snapshot=") && cookie.includes("Max-Age=0"))).toBe(true);
  });

  it("still applies callbacks.sessionPayload after callbacks.signIn succeeds", async () => {
    const handler = NextZenyAuth({
      ...authOptions,
      callbacks: {
        signIn: async () => undefined,
        sessionPayload(user) {
          return {
            email: user.email,
            role: "admin" as const
          };
        }
      }
    });

    const response = await handler.POST(
      new Request("https://app.example.com/api/auth/signin/email", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          email: "ada@example.com",
          password: "pass123"
        })
      }),
      makeContext(["signin", "email"])
    );

    const cookies = getSetCookies(response);
    const session = await getServerSession<{ email: string; role: "admin" }>(
      new Request("https://app.example.com/protected", {
        headers: {
          cookie: cookies
            .map((cookie) => cookie.split(";")[0])
            .join("; ")
        }
      }),
      {
        ...authOptions,
        callbacks: {
          signIn: async () => undefined,
          sessionPayload(user) {
            return {
              email: user.email,
              role: "admin" as const
            };
          }
        }
      }
    );

    expect(session.isValid).toBe(true);
    expect(session.user).toEqual({
      email: "ada@example.com",
      role: "admin"
    });
  });
});
