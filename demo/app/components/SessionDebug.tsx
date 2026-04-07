"use client";

import { useSession } from "zenyauth/react";
import { useEffect, useState } from "react";

export function SessionDebug() {
  const { user, expiryDate, isValid, isExpired } = useSession();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const secondsRemaining =
    expiryDate && now
      ? Math.max(0, Math.floor((expiryDate.getTime() - now.getTime()) / 1000))
      : null;

  const snapshot = {
    isValid,
    isExpired,
    expiryDate: expiryDate?.toISOString() ?? null,
    secondsRemaining,
    user
  };

  return (
    <div className="border border-border bg-surface p-4">
      <p className="text-xs text-muted font-mono mb-3 uppercase tracking-widest">
        Client Snapshot (live)
      </p>
      <pre className="text-xs font-mono text-text/70 leading-relaxed overflow-x-auto whitespace-pre-wrap">
        {JSON.stringify(snapshot, null, 2)}
      </pre>
    </div>
  );
}
