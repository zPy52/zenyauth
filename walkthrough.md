# ZenyAuth Walkthrough

ZenyAuth is a small auth layer for Next.js that keeps the core session state in signed cookies and exposes the same session snapshot on the server, in React, and in route handlers.

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
2. The Next.js app hydrates the client from a server header.
3. React components read the current session from an external store.
4. Cross-tab updates are synced with `BroadcastChannel` when available.

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
import { SessionProvider } from "zenyauth/next";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

### Why This Exists

`SessionProvider` reads a special request header when `initialSnapshot` is omitted, then passes that snapshot into the client session store.

That avoids a second session fetch on first render.

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

The request is also decorated with a serialized session header for downstream code.

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

The session is stored in an HTTP-only cookie with a configurable prefix.

The default cookie names are:

1. `za.session`
2. `za.flow.<providerId>`

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
5. The session cookie is HTTP-only, so the browser cannot read it directly from JavaScript.

## Summary

Use ZenyAuth when you want:

1. A typed auth config shared across server and client
2. Cookie-backed sessions with no client session fetch on first render
3. OAuth and email provider support
4. Next.js helpers for route handlers, middleware, server components, and React hooks

The recommended usage path is:

1. Define `auth`
2. Mount `createNextAuth(auth)` on `/api/authorize/[...zenyauth]`
3. Wrap the app in `SessionProvider`
4. Read session with `useSession()` in client components
5. Read session with `Session.read(auth)` or `Session.user(auth)` on the server
