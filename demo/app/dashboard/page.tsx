import { redirect } from "next/navigation";
import Image from "next/image";
import { Session } from "zenyauth/next";
import { auth } from "@/src/auth";
import { SignOutButton } from "@/app/components/SignOutButton";
import { SessionDebug } from "@/app/components/SessionDebug";
import { LimitsPanel } from "@/app/components/LimitsPanel";

export default async function DashboardPage() {
  const snapshot = await Session.read(auth);

  if (!snapshot.isValid || !snapshot.user) {
    redirect("/login");
  }

  const user = snapshot.user;
  const userId = (user as Record<string, unknown>).id as string | undefined;

  return (
    <main className="min-h-screen px-8 py-12">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto">
        <div className="flex items-start justify-between mb-12">
          <div>
            <p className="font-mono text-xs text-muted uppercase tracking-widest mb-1">
              Protected Route
            </p>
            <h1
              className="font-black text-3xl text-text"
              style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
            >
              Dashboard
            </h1>
          </div>
          <SignOutButton callbackUrl="/" />
        </div>

        <div className="border border-border bg-surface p-6 mb-6 flex items-center gap-5">
          {user.image ? (
            <Image
              src={user.image}
              alt={user.name ?? user.email}
              width={52}
              height={52}
              className="rounded-full border border-border"
            />
          ) : (
            <div
              className="w-13 h-13 rounded-full border border-border bg-background flex items-center justify-center text-text font-black text-xl"
              style={{ fontFamily: "var(--font-unbounded), sans-serif", width: 52, height: 52 }}
            >
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-mono text-sm text-text font-bold">{user.name ?? "—"}</p>
            <p className="font-mono text-xs text-muted">{user.email}</p>
            {userId && (
              <p className="font-mono text-xs text-muted/50 mt-1">id: {userId}</p>
            )}
          </div>
        </div>

        <div className="border border-border bg-surface p-4 mb-6">
          <p className="text-xs text-muted font-mono mb-3 uppercase tracking-widest">
            Server Snapshot (Session.read)
          </p>
          <pre className="text-xs font-mono text-text/70 leading-relaxed overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(
              {
                isValid: snapshot.isValid,
                isExpired: snapshot.isExpired,
                expiryDate: snapshot.expiryDate?.toISOString()
              },
              null,
              2
            )}
          </pre>
        </div>

        <LimitsPanel />

        <SessionDebug />

        <p className="mt-6 text-xs text-muted font-mono leading-relaxed border-t border-border pt-4">
          Open this page in another tab and sign out there — this tab will update
          automatically via BroadcastChannel sync.
        </p>
      </div>
    </main>
  );
}
