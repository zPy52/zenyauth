# ZenyAuth Walkthrough

ZenyAuth is a small auth layer for Next.js that keeps the core session state in signed cookies and exposes the same session snapshot on the server, in React, and in route handlers.

It is intentionally not a database. If your app needs to create user records, keep an `imageUrl`, store roles, or sync profile changes, use your own datastore, such as Redis, and wire it in through the auth callbacks.

The main idea is:

1. Define a single auth config with providers and session options.
2. Reuse that config in Next.js route handlers, server helpers, and React components.
3. Let the library manage the session cookie, OAuth flow, and client hydration.

This document walks through how the package is structured, how the pieces fit together, and how to use it in a real app.

## What The Package Exports

The package is split into a few entry points:

1. `zenyauth`
2. `zenyauth/react`
3. `zenyauth/next`
4. `zenyauth/providers/github`
5. `zenyauth/providers/google`
6. `zenyauth/providers/microsoft`
7. `zenyauth/providers/apple`
8. `zenyauth/providers/email`

At the root, you define auth configuration:

```ts
import { createAuth, defineAuth } from "zenyauth";
```

The root package also exports the limiter primitives:

```ts
import { RateLimiter, UsageLimiter } from "zenyauth";
```

From `zenyauth/react`, you get client-side session access:

```ts
import { SessionProvider, useSession, createReactAuth, Session } from "zenyauth/react";
```

From `zenyauth/next`, you get the Next.js integration:

```ts
import { createNextAuth, SessionProvider, Session, withAuth, getServerSession } from "zenyauth/next";
```

## Mental Model

ZenyAuth stores the authenticated user in a signed JWT cookie. A session snapshot looks like this:

```ts
type SessionSnapshot<TUser> = {
  user: TUser | undefined;
  expiryDate: Date | undefined;
  isExpired: boolean;
  isValid: boolean;
};
```

That snapshot is used everywhere:

1. On the server, it is read from cookies.
2. In React, it is hydrated into a client store.
3. In middleware or route guards, it is attached to the request and passed to authorization callbacks.

The package supports two provider types:

1. OAuth providers
2. Email providers

OAuth providers implement the redirect, callback, token exchange, and profile fetch flow.
Email providers accept credentials directly and return a user payload.

If you want to persist app-specific data, the usual pattern is:

1. Use `callbacks.signIn` to create or update the user record in Redis or another store.
2. Use `callbacks.sessionPayload` to read that stored record and shape the session user.
3. Keep the cookie session small and treat Redis as the source of truth for app data.

## How The Flow Works

### Sign In

When a sign-in request hits the auth route:

1. ZenyAuth identifies the provider from the URL.
2. If the provider is OAuth, it generates a state token and optionally a PKCE verifier.
3. It writes a short-lived flow cookie.
4. It redirects the browser to the provider authorization URL.

### Callback

When the provider redirects back:

1. ZenyAuth reads the flow cookie.
2. It validates the OAuth `state`.
3. It exchanges the authorization code for tokens.
4. It fetches the user profile.
5. It maps the profile to a user payload.
6. It signs a session JWT and sets the session cookie.

### Session Access

After sign-in:

1. The server reads the session cookie and verifies the JWT.
2. The auth layer updates a readable snapshot cookie with the decoded session payload.
3. The Next.js app hydrates the client from that snapshot cookie.
3. React components read the current session from an external store.
4. Cross-tab updates are synced with `BroadcastChannel` when available.

## OAuth Provider Setup

ZenyAuth handles the OAuth redirect and callback flow for you, but each provider still needs an app registration with the correct redirect URI.

The callback URL is always built from your auth base path and provider id. For the default setup, register these local URLs so you can test on your machine:

`http://localhost:3000/api/authorize/callback/google`

`http://localhost:3000/api/authorize/callback/microsoft`

If you change `basePath`, replace `/api/authorize` with your custom value.

### Google OAuth

1. Open the Google Cloud Console and create or select a project.
2. Go to APIs and Services > Credentials.
3. Create an OAuth client ID.
4. Choose `Web application` as the application type.
5. Add these Authorized redirect URIs:

`http://localhost:3000/api/authorize/callback/google`

`https://your-production-domain.com/api/authorize/callback/google`

6. Copy these environment variables into your app:

`GOOGLE_CLIENT_ID`

`GOOGLE_CLIENT_SECRET`

Google requires the redirect URI to match exactly. For local development, `http://localhost:3000/...` is allowed, so you can test sign-in on your machine before deploying.

### Microsoft Entra OAuth

1. Open the Microsoft Entra admin center.
2. Go to App registrations and create a new app, or open an existing one.
3. Open Authentication.
4. Under Platform configurations, add a `Web` platform.
5. Add these Redirect URIs:

`http://localhost:3000/api/authorize/callback/microsoft`

`https://your-production-domain.com/api/authorize/callback/microsoft`

6. Copy these environment variables into your app:

`MICROSOFT_CLIENT_ID`

`MICROSOFT_CLIENT_SECRET`

7. Optional: set `MICROSOFT_TENANT_ID` if you want to lock the app to a single tenant. If you omit it, the provider uses `common`.

For local testing, Microsoft Entra also accepts `http://localhost:3000/...` redirect URIs on the Web platform, so you can run the app locally and sign in without deploying first.

## Step 1: Define Auth Config

Create a shared auth config file, usually something like `src/auth.ts`.

Example:

```ts
import { createAuth } from "zenyauth";
import GoogleProvider from "zenyauth/providers/google";
import GithubProvider from "zenyauth/providers/github";

export const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    }),
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!
    })
  ],
  session: {
    maxAge: 60 * 60 * 24 * 30
  },
  callbacks: {
    sessionPayload: async (user) => {
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image
      };
    }
  }
});
```

### What `createAuth` Does

`createAuth` is just a typed helper around your auth options. It preserves the user type so later helpers can infer it automatically.

You can also use `defineAuth`; it is the same function.

### Config Options

The important options are:

1. `secret`: used to sign and verify the session JWT and flow cookie.
2. `providers`: array of OAuth or email providers.
3. `basePath`: defaults to `/api/authorize`.
4. `session.maxAge`: defaults to 30 days.
5. `session.cookiePrefix`: defaults to `za`.
6. `pages.signIn` and `pages.error`: optional redirect pages.
7. `callbacks.signIn`: called after a provider sign-in succeeds.
8. `callbacks.sessionPayload`: maps a provider payload to your app user type.

## Persist App Data In Redis

If you want the whole app to share one user record, a Redis-backed repository is a good fit for a small to medium Next.js app. ZenyAuth can authenticate the user, then your callbacks can upsert the payload into Redis and read it back when building the session snapshot.

This is a good place to store:

1. `id`
2. `email`
3. `name`
4. `imageUrl`
5. `role`
6. `lastLoginAt`
7. App-specific flags and counters

### Example Redis Layer

```ts
// src/lib/user-store.ts
import { createClient } from "redis";

type UserRecord = {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  role?: "admin" | "member";
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
};

const redis = createClient({
  url: process.env.REDIS_URL
});

const ready = redis.connect();

async function ensureRedis(): Promise<void> {
  await ready;
}

export async function getUserRecord(userId: string): Promise<UserRecord | null> {
  await ensureRedis();
  const raw = await redis.get(`user:${userId}`);
  return raw ? (JSON.parse(raw) as UserRecord) : null;
}

export async function upsertUserRecord(input: {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  role?: "admin" | "member";
  lastLoginAt?: string;
}): Promise<UserRecord> {
  await ensureRedis();

  const existing = await getUserRecord(input.id);
  const record: UserRecord = {
    id: input.id,
    email: input.email,
    name: input.name ?? existing?.name,
    imageUrl: input.imageUrl ?? existing?.imageUrl,
    role: input.role ?? existing?.role ?? "member",
    lastLoginAt: input.lastLoginAt ?? existing?.lastLoginAt,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await redis.set(`user:${input.id}`, JSON.stringify(record));
  return record;
}
```

### Wire It Into ZenyAuth

```ts
// src/auth.ts
import { createAuth } from "zenyauth";
import GoogleProvider from "zenyauth/providers/google";

import { getUserRecord, upsertUserRecord } from "@/lib/user-store";

type AppUser = {
  id: string;
  email: string;
  name?: string;
  imageUrl?: string;
  role: "admin" | "member";
  lastLoginAt?: string;
};

export const auth = createAuth<AppUser>({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ],
  callbacks: {
    signIn: async ({ user }) => {
      const userId = user.id ?? user.email;

      await upsertUserRecord({
        id: userId,
        email: user.email,
        name: user.name,
        imageUrl: user.image,
        lastLoginAt: new Date().toISOString()
      });
    },
    sessionPayload: async (user) => {
      const userId = user.id ?? user.email;
      const stored = await getUserRecord(userId);

      return {
        id: userId,
        email: user.email,
        name: stored?.name ?? user.name,
        imageUrl: stored?.imageUrl ?? user.image,
        role: stored?.role ?? "member",
        lastLoginAt: stored?.lastLoginAt
      };
    }
  }
});
```

With this setup:

1. The provider returns the raw profile.
2. `signIn` creates or updates the Redis record.
3. `sessionPayload` reads the Redis record and turns it into the app user.
4. `Session.user(auth)` and `useSession()` both see the same shape.

### Updating `imageUrl` Later

When a user changes their avatar, update Redis first and let the next session read pick it up:

```ts
await upsertUserRecord({
  id: userId,
  email: user.email,
  imageUrl: "https://cdn.example.com/new-avatar.png"
});
```

This keeps the session cookie lean while the app-specific profile data lives in Redis.

## Rate Limiting And Usage Credits

ZenyAuth now also ships two framework-agnostic limiter primitives:

1. `RateLimiter`
2. `UsageLimiter`

The design is intentionally adapter-driven. ZenyAuth defines the request and response schema, but your application decides how to read and write limiter state in your own database, cache, or queue.

That means you can plug in whatever storage you already use:

1. DynamoDB
2. Prisma
3. MongoDB
4. Upstash Redis
5. SQL
6. Custom in-memory logic for tests

The library does not store credits or counters for you. It only normalizes the input and output shape and handles timeout or fallback behavior.

### `RateLimiter`

Use `RateLimiter` when you want to enforce a request budget over a time window.

```ts
import { RateLimiter } from "zenyauth";

const limiter = new RateLimiter({
  namespace: "auth:signin",
  limit: 5,
  duration: "1m",
  adapter: {
    async limit(input) {
      // You own the storage and the algorithm here.
      // Read and write whatever collection/table/cache you want.
      return {
        success: true,
        limit: input.limit,
        remaining: 4,
        reset: input.now + input.durationMs,
        reason: "allowed"
      };
    }
  }
});

const result = await limiter.limit({
  identifier: "user_123",
  cost: 1
});
```

The adapter receives a normalized input object with:

1. `namespace`
2. `identifier`
3. `key`
4. `limit`
5. `durationMs`
6. `cost`
7. `now`
8. `meta`

The result shape is also normalized:

1. `success`
2. `limit`
3. `remaining`
4. `reset`
5. `reason`

### `UsageLimiter`

Use `UsageLimiter` when you want to track consumable credits, not just requests.

```ts
import { UsageLimiter } from "zenyauth";

const usage = new UsageLimiter({
  namespace: "ai:generation",
  limit: 10_000,
  refill: {
    amount: 10_000,
    interval: "30d"
  },
  adapter: {
    async consume(input) {
      // The library gives you the shape.
      // You decide how credits are persisted, decremented, and refilled.
      return {
        success: true,
        limit: input.limit,
        remaining: 9_750,
        used: 250,
        reset: input.now + input.refill!.intervalMs,
        reason: "allowed"
      };
    }
  }
});

const result = await usage.consume({
  identifier: "org_123",
  bucket: "starter",
  cost: 250
});
```

The adapter receives:

1. `namespace`
2. `identifier`
3. `bucket`
4. `key`
5. `limit`
6. `cost`
7. `now`
8. `refill`
9. `meta`

The result shape includes:

1. `success`
2. `limit`
3. `remaining`
4. `used`
5. `reset`
6. `reason`

### Error And Timeout Behavior

Both limiters support the same control flow around adapter failures:

1. Set `failureMode: "closed"` to deny when your adapter fails.
2. Set `failureMode: "open"` to allow when your adapter fails.
3. Set `timeout` to guard slow adapters.
4. Provide `timeout.fallback` if you want a custom fallback result.
5. Provide `onError` if you want to transform thrown adapter errors into a result.

That keeps the library strict about schema while leaving the database strategy entirely in your hands.

## Step 2: Wire Next.js Route Handlers

Use `createNextAuth` in your auth route file.

If you are using the App Router, create:

```ts
// app/api/authorize/[...zenyauth]/route.ts
import { auth } from "@/auth";
import { createNextAuth } from "zenyauth/next";

const zenyauth = createNextAuth(auth);

export const GET = zenyauth.GET;
export const POST = zenyauth.POST;
```

### What The Route Handles

The generated handler supports these actions:

1. `GET /api/authorize/providers`
2. `GET /api/authorize/session`
3. `GET /api/authorize/error`
4. `GET or POST /api/authorize/signin/:provider`
5. `GET or POST /api/authorize/callback/:provider`
6. `POST /api/authorize/signout`

The route parser is strict. Unknown segments return a 404-style auth error.

## Step 3: Hydrate React From The Server

To keep server and client in sync, wrap your app with `SessionProvider`.

Example:

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { createNextAuth } from "zenyauth/next";
import { auth } from "@/src/auth";

const zenyauth = createNextAuth(auth);

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <zenyauth.SessionProvider>{children}</zenyauth.SessionProvider>
      </body>
    </html>
  );
}
```

### Why This Exists

The proxy and auth handlers keep two cookies in sync:

1. An HTTP-only signed JWT cookie
2. A readable snapshot cookie with the decoded session payload

`SessionProvider` reads that snapshot cookie once on initial load and hydrates the client store from it. That avoids a second fetch on first render while still keeping the JWT itself hidden from client JavaScript.

If you are not using Next.js, or you want to hydrate manually, use the React `SessionProvider` directly and pass `initialSnapshot` yourself.

## Step 4: Read Session In React

Use `useSession` in client components:

```tsx
"use client";

import { useSession } from "zenyauth/react";

export function UserMenu() {
  const session = useSession();

  if (!session.isValid) {
    return <a href="/login">Sign in</a>;
  }

  return (
    <div>
      <p>{session.user?.email}</p>
      <button onClick={() => session.signOut({ callbackUrl: "/" })}>Sign out</button>
    </div>
  );
}
```

The hook returns both the snapshot fields and the actions:

1. `user`
2. `expiryDate`
3. `isExpired`
4. `isValid`
5. `signIn(provider, options)`
6. `signOut(options)`

## Step 5: Read Session On The Server

Use the server helper when you need auth state in server components, route handlers, or server actions.

```ts
import { auth } from "@/auth";
import { Session } from "zenyauth/next";

export async function GET() {
  const user = await Session.user(auth);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ user });
}
```

You can also read the full snapshot:

```ts
const snapshot = await Session.read(auth);
```

The same helpers exist for:

1. `Session.user(auth)`
2. `Session.expiryDate(auth)`
3. `Session.isExpired(auth)`
4. `Session.isValid(auth)`

## Step 6: Protect Routes With `withAuth`

For route protection, use `withAuth`.

```ts
// middleware.ts
import { auth } from "@/auth";
import { withAuth } from "zenyauth/next";

export default withAuth(auth, undefined, {
  pages: {
    signIn: "/login"
  },
  callbacks: {
    authorized: ({ session }) => {
      return session.isValid;
    }
  }
});

export const config = {
  matcher: ["/dashboard/:path*"]
};
```

If the request is unauthorized and the request expects HTML, ZenyAuth redirects to the configured sign-in page with a `callbackUrl`.

If the handler returns a response, it can also pass through the `auth` snapshot:

```ts
import { auth } from "@/auth";
import { withAuth } from "zenyauth/next";

export default withAuth(auth, async (req) => {
  if (!req.auth.isValid) {
    return new Response("Unauthorized", { status: 401 });
  }

  return Response.json({ email: req.auth.user?.email });
});
```

The request is also decorated with a serialized session header for downstream middleware and server code.

## Step 7: Trigger Sign In And Sign Out

The client-side API mirrors the server helpers.

### Sign In

```tsx
"use client";

import { useSession } from "zenyauth/react";

export function LoginButton() {
  const session = useSession();

  return (
    <button onClick={() => session.signIn("google", { callbackUrl: "/dashboard" })}>
      Sign in with Google
    </button>
  );
}
```

The `provider` argument must match the provider `id`, such as `google`, `github`, `apple`, `microsoft`, or your custom provider id.

For OAuth providers, `signIn` starts the redirect flow. For email providers, it posts the credentials and returns a session response.

### Sign Out

```tsx
"use client";

import { useSession } from "zenyauth/react";

export function LogoutButton() {
  const session = useSession();

  return (
    <button onClick={() => session.signOut({ callbackUrl: "/" })}>
      Sign out
    </button>
  );
}
```

## Built-In Providers

ZenyAuth ships with provider factories for common providers.

### Google

```ts
import GoogleProvider from "zenyauth/providers/google";

GoogleProvider({
  clientId: process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!
});
```

Google uses:

1. `openid`, `profile`, and `email` scopes
2. `state` and `pkce` checks
3. `userinfo` to fetch the profile

### GitHub

```ts
import GithubProvider from "zenyauth/providers/github";
```

GitHub uses:

1. `read:user`
2. `user:email`
3. A separate `/user/emails` fetch so it can resolve a verified email address

### Microsoft

```ts
import MicrosoftProvider from "zenyauth/providers/microsoft";
```

You can pass an optional `tenantId`. If omitted, it uses `common`.

### Apple

```ts
import AppleProvider from "zenyauth/providers/apple";
```

Apple uses:

1. `state`
2. `pkce`
3. `response_mode=form_post`

### Email

```ts
import EmailProvider from "zenyauth/providers/email";
```

An email provider is not magic. You provide the credential check yourself:

```ts
import EmailProvider from "zenyauth/providers/email";

EmailProvider({
  authorize: async (credentials) => {
    const email = String(credentials.email ?? "");
    const password = String(credentials.password ?? "");

    if (email === "alice@example.com" && password === "secret") {
      return {
        id: "alice",
        email,
        name: "Alice"
      };
    }

    return null;
  }
});
```

## Custom User Types

The package is typed so you can define your own user object instead of using the default `{ email, name?, image? }`.

Example:

```ts
import { createAuth } from "zenyauth";
import GoogleProvider from "zenyauth/providers/google";

type AppUser = {
  id: string;
  email: string;
  role: "admin" | "member";
};

export const auth = createAuth<AppUser>({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ],
  callbacks: {
    sessionPayload: async (user) => ({
      id: user.id ?? user.email,
      email: user.email,
      role: "member"
    })
  }
});
```

That type will flow into:

1. `Session.read(auth)`
2. `Session.user(auth)`
3. `createNextAuth(auth).Session`
4. `createReactAuth(auth).useSession()`

## How The Internals Fit Together

### Session Cookie

The session is stored in two cookies with a configurable prefix.

The default cookie names are:

1. `za.session`
2. `za.snapshot`
3. `za.flow.<providerId>`

The session cookie contains a signed JWT with:

1. `sub`
2. `provider`
3. `user`
4. `iat`
5. `exp`

### Flow Cookie

OAuth sign-in uses a short-lived flow cookie to preserve:

1. `provider`
2. `state`
3. `callbackUrl`
4. `codeVerifier` if PKCE is enabled

That prevents the callback from being accepted unless it matches the original sign-in request.

### Client Store

On the client, the library keeps one shared in-memory session store.

It:

1. Hydrates from the server snapshot
2. Subscribes React components with `useSyncExternalStore`
3. Revalidates across tabs with `BroadcastChannel` when available
4. Marks the snapshot expired when the expiry timer runs out

## Full Minimal Example

Here is the smallest realistic setup.

```ts
// auth.ts
import { createAuth } from "zenyauth";
import GoogleProvider from "zenyauth/providers/google";

export const auth = createAuth({
  secret: process.env.AUTH_SECRET!,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!
    })
  ]
});
```

```ts
// app/api/authorize/[...zenyauth]/route.ts
import { auth } from "@/auth";
import { createNextAuth } from "zenyauth/next";

const zenyauth = createNextAuth(auth);

export const GET = zenyauth.GET;
export const POST = zenyauth.POST;
```

```tsx
// app/layout.tsx
import type { ReactNode } from "react";
import { SessionProvider } from "zenyauth/next";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

```tsx
// app/login/page.tsx
"use client";

import { useSession } from "zenyauth/react";

export default function LoginPage() {
  const session = useSession();

  return (
    <button onClick={() => session.signIn("google", { callbackUrl: "/dashboard" })}>
      Sign in
    </button>
  );
}
```

```tsx
// app/dashboard/page.tsx
import { auth } from "@/auth";
import { Session } from "zenyauth/next";

export default async function DashboardPage() {
  const user = await Session.user(auth);

  if (!user) {
    return <p>Unauthorized</p>;
  }

  return <pre>{JSON.stringify(user, null, 2)}</pre>;
}
```

## Practical Notes

1. `secret` must be stable across server instances, or existing sessions will fail verification.
2. `basePath` should match the route where you mounted the handler.
3. OAuth provider callback URLs must match what you configured at the identity provider.
4. The package expects a browser for client store hydration and cross-tab sync.
5. The signed session JWT cookie is HTTP-only, and the readable snapshot cookie is only used for client hydration.

## Summary

Use ZenyAuth when you want:

1. A typed auth config shared across server and client
2. Cookie-backed sessions with no client session fetch on first render
3. OAuth and email provider support
4. Next.js helpers for route handlers, middleware, server components, and React hooks
5. A clean place to sync auth payloads into Redis or another datastore

The recommended usage path is:

1. Define `auth`
2. Mount `createNextAuth(auth)` on `/api/authorize/[...zenyauth]`
3. Wrap the app in `SessionProvider`
4. Read session with `useSession()` in client components
5. Read session with `Session.read(auth)` or `Session.user(auth)` on the server
6. Use `callbacks.signIn` and `callbacks.sessionPayload` to persist and hydrate app-specific user data
