We want one programmer-facing hook that runs on successful auth so app code can do dead-simple server work like upserting a user in DynamoDB without adopting NextAuth-style multi-shape callbacks.

---

## Summary

Add a single new server callback to `ZenyAuthOptions`:

```ts
export type SignInCallbackContext = {
  req: Request;
  provider: string;
  user: ProviderUserPayload;
};

export type ZenyAuthOptions<TUser = DefaultUser> = {
  secret: string;
  providers: Provider<TUser>[];
  basePath?: string;
  pages?: {
    error?: string;
    signIn?: string;
  };
  session?: {
    maxAge?: number;
    cookiePrefix?: string;
    sameSite?: "lax" | "strict" | "none";
    secure?: boolean;
  };
  callbacks?: {
    signIn?: (context: SignInCallbackContext) => void | Promise<void>;
    sessionPayload?: (input: ProviderUserPayload) => TUser | Promise<TUser>;
  };
};
```

Behavior:

1. Provider resolves a `ProviderUserPayload`.
2. `callbacks.signIn?.({ req, provider, user })` runs.
3. If it completes, `callbacks.sessionPayload?.(user)` runs.
4. Session cookies are minted and response continues.
5. If `callbacks.signIn` throws, sign-in fails and no session is created.

This is intentionally simpler than NextAuth/Auth.js:

- no boolean return
- no redirect return
- no mixed argument bag
- no client-side hook
- only one clear server-side success hook

---

## Implementation Changes

### Public API

Update `src/shared/types.ts` to add:

```ts
export type SignInCallbackContext = {
  req: Request;
  provider: string;
  user: ProviderUserPayload;
};
```

Update package exports from `src/index.ts` and `src/next/index.ts`:

```ts
export type {
  DefaultUser,
  Provider,
  ProviderUserPayload,
  SessionSnapshot,
  SessionState,
  SignInCallbackContext,
  SignInResult,
  ZenyAuthOptions
} from "./shared/types";
```

### Server flow

In `src/next/handler.ts`, introduce a helper:

```ts
async function runSignInCallback<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>,
  providerId: string,
  user: ProviderUserPayload
): Promise<void> {
  await options.callbacks?.signIn?.({
    req,
    provider: providerId,
    user
  });
}
```

Update `buildSuccessSessionResponse` to receive `req` and run the new hook before `mapSessionUser`:

```ts
async function buildSuccessSessionResponse<TUser>(
  req: Request,
  options: NormalizedZenyAuthOptions<TUser>,
  providerId: string,
  payload: ProviderUserPayload,
  init?: {
    redirectTo?: string;
    extraCookies?: string[];
    body?: Record<string, unknown>;
  }
): Promise<Response> {
  await runSignInCallback(req, options, providerId, payload);
  const user = await mapSessionUser(options, payload);
  // existing session creation logic...
}
```

Callsite changes:

```ts
return buildSuccessSessionResponse(req, options, provider.id, user);
```

```ts
return buildSuccessSessionResponse(req, options, provider.id, user, {
  redirectTo: flow.callbackUrl || "/",
  extraCookies
});
```

### Error behavior

Keep the callback strict:

- if `callbacks.signIn` throws during email sign-in, return the existing top-level `500` error response and do not set auth cookies
- if it throws during OAuth callback, also clear the flow cookie and auth cookies before returning the error response

Do not change `sessionPayload`; it remains the place for shaping the cookie-safe client session.

### Usage

The server can now run a tiny custom function during sign-in before the session cookies are created:

```ts
// app/api/authorize/[...zenyauth]/route.ts

import { NextZenyAuth } from "zenyauth/next";
import GoogleProvider from "zenyauth/providers/google";
import EmailProvider from "zenyauth/providers/email";

async function upsertUserInDynamoDB(user: { email: string; name?: string; image?: string }) {
  // programmer logic goes here
}

export const authOptions = {
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_ID!,
      clientSecret: process.env.GOOGLE_SECRET!
    }),
    EmailProvider({
      async authorize(credentials) {
        if (
          credentials.email === "ada@example.com" &&
          credentials.password === "pass123"
        ) {
          return {
            email: "ada@example.com",
            name: "Ada Lovelace"
          };
        }

        return null;
      }
    })
  ],
  callbacks: {
    async signIn({ user, provider, req }) {
      await upsertUserInDynamoDB({
        email: user.email,
        name: user.name,
        image: user.image
      });
    },

    sessionPayload(user) {
      return {
        email: user.email,
        name: user.name,
        image: user.image
      };
    }
  }
};

const handler = NextZenyAuth(authOptions);

export const GET = handler.GET;
export const POST = handler.POST;
```

`callbacks.signIn` only runs on the server after a provider has produced a valid user and before `zenyauth` creates the session cookies. Throwing aborts sign-in. Returning anything is ignored.

---

## Test Plan

Add handler tests in `tests/next/handler.test.ts`:

```ts
it("runs callbacks.signIn for email sign-in before creating the session", async () => {
  // assert callback called once with req, provider: "email", user payload
  // assert session cookies still created on success
});

it("runs callbacks.signIn for oauth callback before redirecting", async () => {
  // assert callback called once with provider id and fetched oauth user
  // assert redirect still happens on success
});

it("fails sign-in when callbacks.signIn throws for email sign-in", async () => {
  // assert 500
  // assert no za.session / za.proof cookies
});

it("fails oauth callback and clears flow/auth cookies when callbacks.signIn throws", async () => {
  // assert error response
  // assert za.flow.<provider> cleared
  // assert za.session / za.proof cleared or absent
});

it("still applies callbacks.sessionPayload after callbacks.signIn succeeds", async () => {
  // assert stored session user matches transformed sessionPayload output
});
```

Also add one type-surface check by compiling a sample `callbacks.signIn` usage with `{ req, provider, user }`.

---

## Assumptions

- The new hook is server-only and not exposed through `zenyauth/react`.
- `callbacks.signIn` is for programmer logic like persistence, auditing, and allow/deny-by-throw.
- `callbacks.sessionPayload` stays as-is and is not merged into the new hook.
- The hook input stays minimal: `req`, `provider`, `user`.
- Returning a value from `callbacks.signIn` is unsupported and ignored; throwing is the only failure mechanism.
- The plan does not add user/account adapters or “new user” detection yet; DynamoDB persistence is custom app logic inside the hook.
