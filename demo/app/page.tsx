import Link from "next/link";
import { auth } from "@/src/auth";
import { Session } from "zenyauth/next";
import { SignInButton } from "@/app/components/SignInButton";
import { SessionStatus } from "@/app/components/SessionStatus";

const features = [
  ["OAuth", "Google + Microsoft with PKCE flow"],
  ["JWT Cookies", "HTTP-only signed session cookie"],
  ["Server Session", "Session.read() in server components"],
  ["React Hook", "useSession() with useSyncExternalStore"],
  ["Middleware", "withAuth() protects /dashboard"],
  ["Cross-tab Sync", "BroadcastChannel live updates"]
] as const;

export default async function HomePage() {
  const isSignedIn = await Session.isValid(auth);

  return (
    <main className="min-h-screen flex flex-col">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }}
      />

      <nav className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto w-full">
        <span
          className="text-text text-sm tracking-widest uppercase font-black"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
        >
          ZenyAuth
        </span>
        <SessionStatus />
      </nav>

      <section className="relative z-10 flex-1 flex flex-col items-start justify-center px-8 py-24 max-w-7xl mx-auto w-full">
        <div className="max-w-2xl w-full">
          <p className="text-xs font-mono text-muted uppercase tracking-widest mb-6">
            Next.js Auth Demo
          </p>
          <h1
            className="font-black text-5xl md:text-7xl leading-none tracking-tight mb-8 text-text"
            style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
          >
            JWT-Cookie
            <br />
            Auth for
            <br />
            Next.js
          </h1>
          <p className="text-muted font-mono text-sm leading-relaxed mb-12 max-w-lg">
            Lightweight, typed, cookie-backed sessions. OAuth with Google and
            Microsoft. Middleware protection. Cross-tab sync via BroadcastChannel.
          </p>

          {isSignedIn ? (
            <div className="flex flex-col gap-4">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-text text-background font-mono text-sm font-bold tracking-wide hover:bg-accent-dim transition-colors"
              >
                Open Dashboard
                <span aria-hidden="true">→</span>
              </Link>
              <p className="text-xs text-muted font-mono">
                You are signed in.{" "}
                <Link href="/dashboard" className="text-text hover:underline">
                  View session details.
                </Link>
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-xs">
              <SignInButton provider="google" />
              <SignInButton provider="microsoft-entra-id" />
            </div>
          )}
        </div>

        <div className="mt-24 grid grid-cols-2 md:grid-cols-3 gap-px border border-border max-w-2xl w-full bg-border">
          {features.map(([title, desc]) => (
            <div key={title} className="bg-background p-5">
              <p className="text-text font-mono text-xs font-bold mb-1.5">{title}</p>
              <p className="text-muted font-mono text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
