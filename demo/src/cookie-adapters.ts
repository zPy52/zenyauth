import type {
  RateLimitAdapter,
  RateLimitAdapterInput,
  RateLimitResult,
  UsageLimitAdapter,
  UsageLimitAdapterInput,
  UsageLimitResult
} from "zenyauth";

/**
 * Sliding-window rate-limit adapter backed by a client cookie.
 * State is a JSON array of timestamps (ms).
 */
export class CookieRateLimitAdapter implements RateLimitAdapter {
  private timestamps: number[];

  constructor(cookieValue: string | undefined) {
    try {
      this.timestamps = cookieValue ? (JSON.parse(cookieValue) as number[]) : [];
    } catch {
      this.timestamps = [];
    }
  }

  limit(input: RateLimitAdapterInput): RateLimitResult {
    const { limit, durationMs, cost, now } = input;
    const windowStart = now - durationMs;

    this.timestamps = this.timestamps.filter((t) => t > windowStart);
    const used = this.timestamps.length;
    const wouldRemain = limit - used - cost;

    if (wouldRemain < 0) {
      const reset = this.timestamps.length > 0
        ? this.timestamps[0]! + durationMs
        : now + durationMs;
      return { success: false, limit, remaining: Math.max(0, limit - used), reset, reason: "rate_limited" };
    }

    for (let i = 0; i < cost; i++) {
      this.timestamps.push(now);
    }

    const reset = this.timestamps.length > 0
      ? this.timestamps[0]! + durationMs
      : now + durationMs;
    return { success: true, limit, remaining: Math.max(0, limit - used - cost), reset, reason: "allowed" };
  }

  serialize(): string {
    return JSON.stringify(this.timestamps);
  }
}

type CreditsData = { used: number; lastRefill: number };

/**
 * Credit/usage-limit adapter backed by a client cookie.
 * State is JSON: { used, lastRefill }.
 */
export class CookieUsageLimitAdapter implements UsageLimitAdapter {
  private used: number;
  private lastRefill: number;

  constructor(cookieValue: string | undefined) {
    try {
      const data: CreditsData = cookieValue
        ? (JSON.parse(cookieValue) as CreditsData)
        : { used: 0, lastRefill: Date.now() };
      this.used = data.used ?? 0;
      this.lastRefill = data.lastRefill ?? Date.now();
    } catch {
      this.used = 0;
      this.lastRefill = Date.now();
    }
  }

  consume(input: UsageLimitAdapterInput): UsageLimitResult {
    const { limit, cost, now, refill } = input;

    if (refill) {
      const cycles = Math.floor((now - this.lastRefill) / refill.intervalMs);
      if (cycles > 0) {
        this.used = Math.max(0, this.used - cycles * refill.amount);
        this.lastRefill += cycles * refill.intervalMs;
      }
    }

    const remaining = limit - this.used;
    const reset = refill ? this.lastRefill + refill.intervalMs : null;

    if (remaining < cost) {
      return { success: false, limit, remaining: Math.max(0, remaining), used: this.used, reset, reason: "usage_exceeded" };
    }

    this.used += cost;
    return { success: true, limit, remaining: limit - this.used, used: this.used, reset, reason: "allowed" };
  }

  serialize(): string {
    return JSON.stringify({ used: this.used, lastRefill: this.lastRefill });
  }
}
