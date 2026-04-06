export type MaybePromise<T> = T | Promise<T>;

export type DurationInput =
  | number
  | `${number}ms`
  | `${number}s`
  | `${number}m`
  | `${number}h`
  | `${number}d`;

export type LimiterFailureMode = "open" | "closed";

export type LimiterMeta = Record<string, unknown>;

export type RateLimitInput = {
  identifier: string;
  cost?: number;
  key?: string;
  meta?: LimiterMeta;
};

export type RateLimitAdapterInput = {
  namespace: string;
  identifier: string;
  key: string;
  limit: number;
  durationMs: number;
  cost: number;
  now: number;
  meta?: LimiterMeta;
};

export type RateLimitResultReason =
  | "allowed"
  | "rate_limited"
  | "timeout"
  | "error"
  | "fallback";

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  reason: RateLimitResultReason;
  meta?: LimiterMeta;
};

export interface RateLimitAdapter {
  limit(input: RateLimitAdapterInput): MaybePromise<RateLimitResult>;
}

export type RateLimiterConfig = {
  namespace: string;
  limit: number;
  duration: DurationInput;
  adapter: RateLimitAdapter;
  failureMode?: LimiterFailureMode;
  timeout?: false | {
    ms: number;
    fallback?: (ctx: RateLimitAdapterInput) => MaybePromise<RateLimitResult>;
  };
  onError?: (
    error: Error,
    ctx: RateLimitAdapterInput
  ) => MaybePromise<RateLimitResult>;
  now?: () => number;
};

export type UsageLimitInput = {
  identifier: string;
  cost?: number;
  bucket?: string;
  key?: string;
  meta?: LimiterMeta;
};

export type UsageRefillConfig = {
  amount: number;
  interval: DurationInput;
};

export type UsageLimitAdapterInput = {
  namespace: string;
  identifier: string;
  bucket: string;
  key: string;
  limit: number;
  cost: number;
  now: number;
  refill: {
    amount: number;
    intervalMs: number;
  } | null;
  meta?: LimiterMeta;
};

export type UsageLimitResultReason =
  | "allowed"
  | "usage_exceeded"
  | "timeout"
  | "error"
  | "fallback";

export type UsageLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  used: number;
  reset: number | null;
  reason: UsageLimitResultReason;
  meta?: LimiterMeta;
};

export interface UsageLimitAdapter {
  consume(input: UsageLimitAdapterInput): MaybePromise<UsageLimitResult>;
}

export type UsageLimiterConfig = {
  namespace: string;
  limit: number;
  refill?: UsageRefillConfig;
  adapter: UsageLimitAdapter;
  failureMode?: LimiterFailureMode;
  timeout?: false | {
    ms: number;
    fallback?: (ctx: UsageLimitAdapterInput) => MaybePromise<UsageLimitResult>;
  };
  onError?: (
    error: Error,
    ctx: UsageLimitAdapterInput
  ) => MaybePromise<UsageLimitResult>;
  now?: () => number;
};
