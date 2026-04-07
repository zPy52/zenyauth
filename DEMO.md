# ZenyAuth Demo

A minimal Next.js app for testing ZenyAuth locally.

## Setup

### 1. Build the local zenyauth package

The demo depends on `file:..` — the local source — so it must be built first.

```bash
cd /path/to/zenyauth
npm install
npm run build
```

Repeat this step whenever you make changes to the library.

### 2. Configure environment variables

```bash
cd demo
cp .env.example .env.local
```

Edit `.env.local` and fill in:

| Variable | How to get it |
|---|---|
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → OAuth 2.0 Client |
| `GOOGLE_CLIENT_SECRET` | Same |
| `MICROSOFT_ENTRA_ID_ID` | [Microsoft Entra admin center](https://portal.azure.com/) → App registrations |
| `MICROSOFT_ENTRA_ID_SECRET` | Same |
| `MICROSOFT_ENTRA_ID_ISSUER` | Issuer URL, for example `https://login.microsoftonline.com/<tenant-id>/v2.0` |

Register these callback URLs in each provider:

- **Google:** `http://localhost:3000/api/auth/callback/google`
- **Microsoft Entra ID:** `http://localhost:3000/api/auth/callback/microsoft-entra-id`

### 3. Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Iterating on the library

After editing files in the zenyauth root, rebuild and restart:

```bash
# from zenyauth root
npm run build

# from demo/
npm run dev
```

`npm install` only needs to be re-run if you change the `exports` map in the root `package.json`.

## Pages

| Route | Description |
|---|---|
| `/` | Landing page — sign-in buttons, session status in nav |
| `/login` | Sign-in page — redirects to `/dashboard` if already authenticated |
| `/dashboard` | Protected route — user info, server + client session snapshots, cross-tab sync demo |
