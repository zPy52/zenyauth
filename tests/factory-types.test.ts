import { describe, expectTypeOf, it } from "vitest";

import { defineAuth } from "../src";
import { createNextAuth } from "../src/next";
import { createReactAuth } from "../src/react";

type TypedSessionUser = {
  email: string;
  role: "admin" | "member" | undefined;
};

type TypedClientSession = {
  user: TypedSessionUser | undefined;
  expiryDate: Date | undefined;
  isExpired: boolean;
  isValid: boolean;
  signIn: (provider: string, options?: Record<string, unknown>) => Promise<{
    ok: boolean;
    redirected?: boolean;
    error?: string;
  }>;
  signOut: (options?: { callbackUrl?: string; api?: string }) => Promise<void>;
};

type TypedServerSession = {
  user: TypedSessionUser | undefined;
  expiryDate: Date | undefined;
  isExpired: boolean;
  isValid: boolean;
};

type FallbackClientSession = {
  user:
    | {
        email: string;
        name?: string;
        image?: string;
        id?: string;
        raw?: unknown;
        [key: string]: unknown;
      }
    | undefined;
  expiryDate: Date | undefined;
  isExpired: boolean;
  isValid: boolean;
  signIn: (provider: string, options?: Record<string, unknown>) => Promise<{
    ok: boolean;
    redirected?: boolean;
    error?: string;
  }>;
  signOut: (options?: { callbackUrl?: string; api?: string }) => Promise<void>;
};

describe("factory inferred session typing", () => {
  const authConfig = defineAuth({
    secret: "factory-type-secret",
    providers: [],
    callbacks: {
      sessionPayload(user) {
        return {
          email: user.email,
          role: user.role as "admin" | "member" | undefined
        };
      }
    }
  });

  it("infers the session user from defineAuth", () => {
    const reactAuth = createReactAuth(authConfig);
    const nextAuth = createNextAuth(authConfig);
    type ClientSession = ReturnType<typeof reactAuth.useSession>;
    type ProxyHandler = NonNullable<Parameters<typeof nextAuth.withAuth>[0]>;
    type ProxyRequest = Parameters<ProxyHandler>[0];

    expectTypeOf(null as unknown as ClientSession["user"]).toEqualTypeOf(
      undefined as TypedClientSession["user"]
    );
    expectTypeOf(null as unknown as ClientSession["signIn"]).toEqualTypeOf(
      null as unknown as TypedClientSession["signIn"]
    );
    expectTypeOf(null as unknown as ClientSession["signOut"]).toEqualTypeOf(
      null as unknown as TypedClientSession["signOut"]
    );
    expectTypeOf(nextAuth.getServerSession).returns.resolves.toEqualTypeOf({} as TypedServerSession);
    expectTypeOf(nextAuth.SessionProvider)
      .returns.resolves.toMatchTypeOf<ReturnType<typeof reactAuth.SessionProvider>>();
    expectTypeOf(nextAuth.Session.user).returns.resolves.toEqualTypeOf(undefined as TypedSessionUser | undefined);
    expectTypeOf(null as unknown as ProxyRequest["auth"]["user"]).toEqualTypeOf(
      undefined as TypedSessionUser | undefined
    );
  });

  it("falls back to ProviderUserPayload when sessionPayload is omitted", () => {
    const authWithoutSessionPayload = defineAuth({
      secret: "fallback-secret",
      providers: []
    });

    const reactAuth = createReactAuth(authWithoutSessionPayload);
    type ClientSession = ReturnType<typeof reactAuth.useSession>;
    type FallbackSessionUser = NonNullable<ClientSession["user"]>;

    expectTypeOf(null as unknown as FallbackSessionUser["email"]).toEqualTypeOf("" as string);
    expectTypeOf(null as unknown as FallbackSessionUser["id"]).toEqualTypeOf(
      undefined as string | undefined
    );
    expectTypeOf(null as unknown as ClientSession["signIn"]).toEqualTypeOf(
      null as unknown as FallbackClientSession["signIn"]
    );
  });

  it("supports the split wrapper pattern without repeated user types", () => {
    const authClient = createReactAuth<typeof authConfig>();
    const authServer = createNextAuth(authConfig);
    type ClientSession = ReturnType<typeof authClient.useSession>;

    expectTypeOf(null as unknown as ClientSession["user"]).toEqualTypeOf(
      undefined as TypedClientSession["user"]
    );
    expectTypeOf(authServer.getServerSession).returns.resolves.toEqualTypeOf({} as TypedServerSession);
  });
});
