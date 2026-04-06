import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  RateLimiter,
  UsageLimiter,
  type RateLimitResult,
  type UsageLimitResult
} from "../../src";

describe("shared limiters", () => {
  it("passes normalized rate limit input to the adapter", async () => {
    const adapter = vi.fn(async () => ({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 70_000,
      reason: "allowed" as const
    }));

    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      now: () => 10_000,
      adapter: {
        limit: adapter
      }
    });

    const result = await limiter.limit({
      identifier: "user_123",
      cost: 1,
      meta: { source: "test" }
    });

    expect(result).toEqual({
      success: true,
      limit: 5,
      remaining: 4,
      reset: 70_000,
      reason: "allowed"
    });
    expect(adapter).toHaveBeenCalledWith({
      namespace: "auth:signin",
      identifier: "user_123",
      key: "auth:signin:user_123",
      limit: 5,
      durationMs: 60_000,
      cost: 1,
      now: 10_000,
      meta: { source: "test" }
    });
  });

  it("defaults rate limit cost to 1 and key to namespace:identifier", async () => {
    const adapter = vi.fn(async () => ({
      success: true,
      limit: 10,
      remaining: 9,
      reset: 30_001,
      reason: "allowed" as const
    }));
    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 10,
      duration: "30s",
      now: () => 1,
      adapter: { limit: adapter }
    });

    await limiter.limit({
      identifier: "abc"
    });

    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "auth:signin:abc",
        cost: 1
      })
    );
  });

  it("normalizes rate limit adapter results without overriding the adapter limit", async () => {
    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      adapter: {
        async limit() {
          return {
            success: false,
            limit: 99,
            remaining: -3,
            reset: 123,
            reason: "rate_limited"
          };
        }
      }
    });

    await expect(limiter.limit({ identifier: "user_1" })).resolves.toEqual({
      success: false,
      limit: 99,
      remaining: 0,
      reset: 123,
      reason: "rate_limited"
    });
  });

  it("returns onError output when the rate limit adapter throws", async () => {
    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      adapter: {
        async limit() {
          throw new Error("db failed");
        }
      },
      onError(error, ctx) {
        expect(error.message).toBe("db failed");
        expect(ctx.identifier).toBe("user_1");
        return {
          success: true,
          limit: 5,
          remaining: 5,
          reset: ctx.now,
          reason: "fallback"
        };
      }
    });

    await expect(limiter.limit({ identifier: "user_1" })).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 5,
      reset: expect.any(Number),
      reason: "fallback"
    });
  });

  it("returns timeout fallback output for rate limiting", async () => {
    vi.useFakeTimers();

    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      timeout: {
        ms: 50,
        fallback(ctx) {
          return {
            success: true,
            limit: ctx.limit,
            remaining: ctx.limit,
            reset: ctx.now,
            reason: "fallback"
          };
        }
      },
      adapter: {
        async limit() {
          return await new Promise<RateLimitResult>(() => undefined);
        }
      }
    });

    const pending = limiter.limit({ identifier: "user_1" });
    await vi.advanceTimersByTimeAsync(50);

    await expect(pending).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 5,
      reset: expect.any(Number),
      reason: "fallback"
    });

    vi.useRealTimers();
  });

  it("synthesizes fail-closed rate limit output by default", async () => {
    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      now: () => 88,
      adapter: {
        async limit() {
          throw new Error("boom");
        }
      }
    });

    await expect(limiter.limit({ identifier: "user_1" })).resolves.toEqual({
      success: false,
      limit: 5,
      remaining: 0,
      reset: 88,
      reason: "error"
    });
  });

  it("synthesizes fail-open rate limit output when configured", async () => {
    const limiter = new RateLimiter({
      namespace: "auth:signin",
      limit: 5,
      duration: "1m",
      failureMode: "open",
      now: () => 99,
      adapter: {
        async limit() {
          throw new Error("boom");
        }
      }
    });

    await expect(limiter.limit({ identifier: "user_1" })).resolves.toEqual({
      success: true,
      limit: 5,
      remaining: 5,
      reset: 99,
      reason: "error"
    });
  });

  it("passes normalized usage limit input to the adapter", async () => {
    const adapter = vi.fn(async () => ({
      success: true,
      limit: 10_000,
      remaining: 9_750,
      used: 250,
      reset: 2_592_000_000,
      reason: "allowed" as const
    }));

    const limiter = new UsageLimiter({
      namespace: "ai:generation",
      limit: 10_000,
      refill: {
        amount: 10_000,
        interval: "30d"
      },
      now: () => 5_000,
      adapter: {
        consume: adapter
      }
    });

    await limiter.consume({
      identifier: "org_123",
      bucket: "starter",
      cost: 250,
      meta: { source: "billing" }
    });

    expect(adapter).toHaveBeenCalledWith({
      namespace: "ai:generation",
      identifier: "org_123",
      bucket: "starter",
      key: "ai:generation:starter:org_123",
      limit: 10_000,
      cost: 250,
      now: 5_000,
      refill: {
        amount: 10_000,
        intervalMs: 2_592_000_000
      },
      meta: { source: "billing" }
    });
  });

  it("defaults usage bucket to default and cost to 1", async () => {
    const adapter = vi.fn(async () => ({
      success: true,
      limit: 100,
      remaining: 99,
      used: 1,
      reset: null,
      reason: "allowed" as const
    }));

    const limiter = new UsageLimiter({
      namespace: "credits",
      limit: 100,
      adapter: {
        consume: adapter
      }
    });

    await limiter.consume({
      identifier: "org_1"
    });

    expect(adapter).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "default",
        key: "credits:default:org_1",
        cost: 1
      })
    );
  });

  it("supports usage without refill and keeps null reset", async () => {
    const limiter = new UsageLimiter({
      namespace: "credits",
      limit: 100,
      adapter: {
        async consume(input) {
          expect(input.refill).toBeNull();
          return {
            success: true,
            limit: input.limit,
            remaining: 99,
            used: 1,
            reset: null,
            reason: "allowed"
          };
        }
      }
    });

    await expect(limiter.consume({ identifier: "org_1" })).resolves.toEqual({
      success: true,
      limit: 100,
      remaining: 99,
      used: 1,
      reset: null,
      reason: "allowed"
    });
  });

  it("returns usage adapter denial results and clamps numeric values", async () => {
    const limiter = new UsageLimiter({
      namespace: "credits",
      limit: 100,
      adapter: {
        async consume() {
          return {
            success: false,
            limit: 100,
            remaining: -25,
            used: -1,
            reset: 500,
            reason: "usage_exceeded"
          };
        }
      }
    });

    await expect(limiter.consume({ identifier: "org_1", cost: 20 })).resolves.toEqual({
      success: false,
      limit: 100,
      remaining: 0,
      used: 0,
      reset: 500,
      reason: "usage_exceeded"
    });
  });

  it("validates invalid constructor config", () => {
    expect(
      () =>
        new RateLimiter({
          namespace: "",
          limit: 5,
          duration: "1m",
          adapter: {
            async limit() {
              throw new Error("unused");
            }
          }
        })
    ).toThrow("namespace");

    expect(
      () =>
        new RateLimiter({
          namespace: "auth",
          limit: 0,
          duration: "1m",
          adapter: {
            async limit() {
              throw new Error("unused");
            }
          }
        })
    ).toThrow("limit");

    expect(
      () =>
        new RateLimiter({
          namespace: "auth",
          limit: 1,
          duration: "0ms",
          adapter: {
            async limit() {
              throw new Error("unused");
            }
          }
        })
    ).toThrow("Duration");

    expect(
      () =>
        new UsageLimiter({
          namespace: "usage",
          limit: 1,
          refill: {
            amount: 0,
            interval: "1d"
          },
          adapter: {
            async consume() {
              throw new Error("unused");
            }
          }
        })
    ).toThrow("refill.amount");

    expect(
      () =>
        new UsageLimiter({
          namespace: "usage",
          limit: 1,
          timeout: {
            ms: 0
          },
          adapter: {
            async consume() {
              throw new Error("unused");
            }
          }
        })
    ).toThrow("timeout.ms");
  });

  it("validates invalid per-call input", async () => {
    const rateLimiter = new RateLimiter({
      namespace: "auth",
      limit: 5,
      duration: "1m",
      adapter: {
        async limit() {
          throw new Error("unused");
        }
      }
    });

    const usageLimiter = new UsageLimiter({
      namespace: "usage",
      limit: 100,
      adapter: {
        async consume() {
          throw new Error("unused");
        }
      }
    });

    await expect(rateLimiter.limit({ identifier: "" })).rejects.toThrow("identifier");
    await expect(rateLimiter.limit({ identifier: "user", cost: 0 })).rejects.toThrow("cost");
    await expect(usageLimiter.consume({ identifier: "org", bucket: "" })).rejects.toThrow("bucket");
    await expect(usageLimiter.consume({ identifier: "org", key: "" })).rejects.toThrow("key");
  });

  it("exports limiter types from the package root", () => {
    expectTypeOf<InstanceType<typeof RateLimiter>>().toMatchTypeOf<{
      limit: (input: { identifier: string }) => Promise<RateLimitResult>;
    }>();
    expectTypeOf<InstanceType<typeof UsageLimiter>>().toMatchTypeOf<{
      consume: (input: { identifier: string }) => Promise<UsageLimitResult>;
    }>();
  });
});
