import { redirect } from "next/navigation";
import { Session } from "zenyauth/next";
import { auth } from "@/src/auth";
import { SignInButton } from "@/app/components/SignInButton";

type Props = {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl, error } = await searchParams;

  const isSignedIn = await Session.isValid(auth);
  if (isSignedIn) {
    redirect(callbackUrl ?? "/dashboard");
  }

  const destination = callbackUrl ?? "/dashboard";

  return (
    <main className="min-h-screen flex items-center justify-center px-8">
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "64px 64px"
        }}
      />

      <div className="relative z-10 w-full max-w-sm">
        <p
          className="font-black text-xs text-muted uppercase tracking-widest mb-2"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
        >
          ZenyAuth
        </p>
        <h1
          className="font-black text-3xl text-text mb-2"
          style={{ fontFamily: "var(--font-unbounded), sans-serif" }}
        >
          Sign in
        </h1>
        <p className="text-muted font-mono text-xs mb-10">
          Choose a provider to authenticate.
        </p>

        {error && (
          <div className="mb-6 px-4 py-3 border border-border text-muted text-xs font-mono">
            Error: {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <SignInButton provider="google" callbackUrl={destination} />
          <SignInButton provider="microsoft-entra-id" callbackUrl={destination} />
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-muted font-mono text-xs mb-2">Callback URLs:</p>
          {["/api/auth/callback/google", "/api/auth/callback/microsoft-entra-id"].map((path) => (
            <p key={path} className="font-mono text-xs text-muted/50 mb-1">
              {path}
            </p>
          ))}
        </div>
      </div>
    </main>
  );
}
