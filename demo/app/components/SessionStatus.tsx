"use client";

import { useSession } from "zenyauth/react";
import Image from "next/image";

export function SessionStatus() {
  const { user, isValid } = useSession();

  if (!isValid || !user) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border border-border text-muted text-xs font-mono">
        <span className="w-1.5 h-1.5 rounded-full bg-muted inline-block" />
        not signed in
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 border border-border text-xs font-mono">
      <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block animate-pulse" />
      {user.image ? (
        <Image
          src={user.image}
          alt={user.name ?? user.email}
          width={18}
          height={18}
          className="rounded-full"
        />
      ) : null}
      <span className="text-text">{user.name ?? user.email}</span>
    </div>
  );
}
