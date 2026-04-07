"use client";

import { useSession } from "zenyauth/react";

type Props = {
  callbackUrl?: string;
  className?: string;
};

export function SignOutButton({ callbackUrl = "/", className }: Props) {
  const { signOut } = useSession();

  return (
    <button
      onClick={() => signOut({ callbackUrl })}
      className={
        className ??
        "px-4 py-2 border border-border hover:border-muted text-muted hover:text-text text-xs font-mono transition-colors duration-150 cursor-pointer"
      }
    >
      Sign out
    </button>
  );
}
