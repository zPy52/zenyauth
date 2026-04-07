"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RateLimitState = {
  limit: number;
  remaining: number;
  reset: number;
  windowSeconds: number;
};

type CreditsState = {
  limit: number;
  used: number;
  remaining: number;
  reset: number | null;
  refillAmount: number;
  refillIntervalSeconds: number;
};

type PanelState = {
  rateLimit: RateLimitState | null;
  credits: CreditsState | null;
  lastMessage: string | null;
  lastSuccess: boolean | null;
};

function secondsUntil(ms: number | null, now: number): number | null {
  if (ms === null) return null;
  return Math.max(0, Math.ceil((ms - now) / 1000));
}

function Bar({ value, max, danger }: { value: number; max: number; danger?: boolean }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-1 bg-border w-full mt-2">
      <div
        className={`h-1 transition-all duration-300 ${danger ? "bg-red-500" : "bg-text"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function LimitsPanel() {
  const [state, setState] = useState<PanelState>({
    rateLimit: null,
    credits: null,
    lastMessage: null,
    lastSuccess: null
  });
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/consume");
      if (!res.ok) return;
      const data = await res.json() as { rateLimit: RateLimitState; credits: CreditsState };
      setState((s) => ({ ...s, rateLimit: data.rateLimit, credits: data.credits }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const handleConsume = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/demo/consume", { method: "POST" });
      const data = await res.json() as Record<string, unknown>;

      if (res.status === 429) {
        setState((s) => ({
          ...s,
          rateLimit: (data.rateLimit as RateLimitState) ?? s.rateLimit,
          lastMessage: "Rate limited — slow down!",
          lastSuccess: false
        }));
      } else if (res.status === 402) {
        setState((s) => ({
          ...s,
          credits: (data.credits as CreditsState) ?? s.credits,
          lastMessage: "Credits exhausted — wait for refill.",
          lastSuccess: false
        }));
      } else if (res.ok) {
        setState((s) => ({
          ...s,
          rateLimit: (data.rateLimit as RateLimitState) ?? s.rateLimit,
          credits: (data.credits as CreditsState) ?? s.credits,
          lastMessage: "1 credit consumed.",
          lastSuccess: true
        }));
      }
    } catch {
      setState((s) => ({ ...s, lastMessage: "Request failed.", lastSuccess: false }));
    } finally {
      setLoading(false);
    }
  };

  const { rateLimit, credits, lastMessage, lastSuccess } = state;

  const rlResetSecs = secondsUntil(rateLimit?.reset ?? null, now);
  const creditsResetSecs = secondsUntil(credits?.reset ?? null, now);

  return (
    <div className="border border-border bg-surface p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-muted font-mono uppercase tracking-widest">
          Rate Limit &amp; Credits (cookie-backed)
        </p>
        <button
          onClick={() => void handleConsume()}
          disabled={loading}
          className="px-4 py-1.5 bg-text text-background font-mono text-xs font-bold tracking-wide hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? "…" : "Consume 1 Credit"}
        </button>
      </div>

      {lastMessage && (
        <p
          className={`font-mono text-xs mb-4 px-3 py-2 border ${
            lastSuccess
              ? "border-border text-text/70"
              : "border-red-800 text-red-400"
          }`}
        >
          {lastMessage}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Rate Limit */}
        <div>
          <p className="font-mono text-xs text-text font-bold mb-1">Rate Limit</p>
          <p className="font-mono text-xs text-muted">
            {rateLimit
              ? `${rateLimit.remaining} / ${rateLimit.limit} remaining`
              : "—"}
          </p>
          {rateLimit && (
            <>
              <Bar value={rateLimit.remaining} max={rateLimit.limit} danger={rateLimit.remaining === 0} />
              <p className="font-mono text-xs text-muted/50 mt-1">
                window: {rateLimit.windowSeconds}s
                {rlResetSecs !== null && ` · resets in ${rlResetSecs}s`}
              </p>
            </>
          )}
        </div>

        {/* Credits */}
        <div>
          <p className="font-mono text-xs text-text font-bold mb-1">Credits</p>
          <p className="font-mono text-xs text-muted">
            {credits
              ? `${credits.remaining} / ${credits.limit} remaining (${credits.used} used)`
              : "—"}
          </p>
          {credits && (
            <>
              <Bar value={credits.remaining} max={credits.limit} danger={credits.remaining === 0} />
              <p className="font-mono text-xs text-muted/50 mt-1">
                refill +{credits.refillAmount} / {credits.refillIntervalSeconds}s
                {creditsResetSecs !== null && ` · next in ${creditsResetSecs}s`}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
