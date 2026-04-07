import { cookies } from "next/headers";
import { RateLimiter, UsageLimiter } from "zenyauth";
import { auth } from "@/src/auth";
import { Session } from "zenyauth/next";
import { CookieRateLimitAdapter, CookieUsageLimitAdapter } from "@/src/cookie-adapters";

const RATE_COOKIE = "demo_rl";
const CREDITS_COOKIE = "demo_credits";

// 5 requests per 30 seconds
const RATE_LIMIT = 5;
const RATE_WINDOW = "30s";

// 20 credits total, refill 5 every minute
const CREDITS_LIMIT = 20;
const CREDITS_REFILL = { amount: 5, interval: "1m" as const };

const COOKIE_OPTS = {
  path: "/",
  maxAge: 60 * 60 * 24,
  sameSite: "lax" as const,
  httpOnly: true
};

export async function GET(): Promise<Response> {
  const snapshot = await Session.read(auth);
  if (!snapshot.isValid || !snapshot.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const rlCookie = jar.get(RATE_COOKIE)?.value;
  const creditsCookie = jar.get(CREDITS_COOKIE)?.value;

  const rlAdapter = new CookieRateLimitAdapter(rlCookie);
  const creditsAdapter = new CookieUsageLimitAdapter(creditsCookie);

  // Read current state without consuming (cost=0 not allowed, so peek via serialize)
  // We peek by constructing adapters with current state and returning their view
  const now = Date.now();
  const durationMs = 30_000;

  // Parse current rate-limit state for read-only view
  const rlTimestamps: number[] = (() => {
    try { return rlCookie ? (JSON.parse(rlCookie) as number[]) : []; } catch { return []; }
  })();
  const rlUsed = rlTimestamps.filter((t) => t > now - durationMs).length;
  const rlRemaining = Math.max(0, RATE_LIMIT - rlUsed);
  const rlOldest = rlTimestamps.filter((t) => t > now - durationMs)[0];
  const rlReset = rlOldest ? rlOldest + durationMs : now + durationMs;

  // Parse current credits state for read-only view
  const creditsData: { used: number; lastRefill: number } = (() => {
    try { return creditsCookie ? JSON.parse(creditsCookie) : { used: 0, lastRefill: now }; } catch { return { used: 0, lastRefill: now }; }
  })();
  const refillMs = 60_000;
  const cycles = Math.floor((now - creditsData.lastRefill) / refillMs);
  const creditsUsed = Math.max(0, creditsData.used - cycles * CREDITS_REFILL.amount);
  const creditsRemaining = Math.max(0, CREDITS_LIMIT - creditsUsed);
  const creditsReset = creditsData.lastRefill + (cycles + 1) * refillMs;

  return Response.json({
    rateLimit: {
      limit: RATE_LIMIT,
      remaining: rlRemaining,
      reset: rlReset,
      windowSeconds: 30
    },
    credits: {
      limit: CREDITS_LIMIT,
      used: creditsUsed,
      remaining: creditsRemaining,
      reset: creditsReset,
      refillAmount: CREDITS_REFILL.amount,
      refillIntervalSeconds: 60
    }
  });
}

export async function POST(): Promise<Response> {
  const snapshot = await Session.read(auth);
  if (!snapshot.isValid || !snapshot.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const jar = await cookies();
  const rlCookie = jar.get(RATE_COOKIE)?.value;
  const creditsCookie = jar.get(CREDITS_COOKIE)?.value;

  const identifier = "demo-user";

  const rlAdapter = new CookieRateLimitAdapter(rlCookie);
  const rateLimiter = new RateLimiter({
    namespace: "demo",
    limit: RATE_LIMIT,
    duration: RATE_WINDOW,
    adapter: rlAdapter
  });

  const rlResult = await rateLimiter.limit({ identifier });

  // Always persist updated rate-limit state
  jar.set(RATE_COOKIE, rlAdapter.serialize(), COOKIE_OPTS);

  if (!rlResult.success) {
    return Response.json(
      {
        error: "rate_limited",
        rateLimit: {
          limit: rlResult.limit,
          remaining: rlResult.remaining,
          reset: rlResult.reset,
          windowSeconds: 30
        }
      },
      { status: 429 }
    );
  }

  const creditsAdapter = new CookieUsageLimitAdapter(creditsCookie);
  const usageLimiter = new UsageLimiter({
    namespace: "demo-credits",
    limit: CREDITS_LIMIT,
    refill: CREDITS_REFILL,
    adapter: creditsAdapter
  });

  const creditsResult = await usageLimiter.consume({ identifier });

  jar.set(CREDITS_COOKIE, creditsAdapter.serialize(), COOKIE_OPTS);

  if (!creditsResult.success) {
    return Response.json(
      {
        error: "credits_exhausted",
        credits: {
          limit: creditsResult.limit,
          used: creditsResult.used,
          remaining: creditsResult.remaining,
          reset: creditsResult.reset,
          refillAmount: CREDITS_REFILL.amount,
          refillIntervalSeconds: 60
        }
      },
      { status: 402 }
    );
  }

  return Response.json({
    ok: true,
    rateLimit: {
      limit: rlResult.limit,
      remaining: rlResult.remaining,
      reset: rlResult.reset,
      windowSeconds: 30
    },
    credits: {
      limit: creditsResult.limit,
      used: creditsResult.used,
      remaining: creditsResult.remaining,
      reset: creditsResult.reset,
      refillAmount: CREDITS_REFILL.amount,
      refillIntervalSeconds: 60
    }
  });
}
