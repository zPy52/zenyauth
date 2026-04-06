import type {
  DurationInput,
  RateLimitAdapterInput,
  RateLimitInput,
  RateLimitResult,
  RateLimiterConfig,
  UsageLimitAdapterInput,
  UsageLimitInput,
  UsageLimitResult,
  UsageLimiterConfig
} from "./limit-types";

const DURATION_UNITS = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000
} as const;

type TimeoutResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" };

export function parseDuration(input: DurationInput): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) {
      throw new Error("Duration must be a positive finite number.");
    }
    return input;
  }

  const match = /^(?<value>\d+(?:\.\d+)?)(?<unit>ms|s|m|h|d)$/.exec(input);
  if (!match?.groups) {
    throw new Error(`Invalid duration "${input}".`);
  }

  const value = Number(match.groups.value);
  const unit = match.groups.unit as keyof typeof DURATION_UNITS;
  const durationMs = value * DURATION_UNITS[unit];

  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error("Duration must be greater than zero.");
  }

  return durationMs;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<TimeoutResult<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, reason: "timeout" });
    }, ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function normalizeRateLimitFailure(
  config: RateLimiterConfig,
  now: number,
  reason: "error" | "timeout"
): RateLimitResult {
  if (config.failureMode === "open") {
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit,
      reset: now,
      reason
    };
  }

  return {
    success: false,
    limit: config.limit,
    remaining: 0,
    reset: now,
    reason
  };
}

export function normalizeUsageLimitFailure(
  config: UsageLimiterConfig,
  now: number,
  reason: "error" | "timeout"
): UsageLimitResult {
  if (config.failureMode === "open") {
    return {
      success: true,
      limit: config.limit,
      remaining: config.limit,
      used: 0,
      reset: null,
      reason
    };
  }

  return {
    success: false,
    limit: config.limit,
    remaining: 0,
    used: config.limit,
    reset: now,
    reason
  };
}

function validateNamespace(namespace: string): void {
  if (!namespace.trim()) {
    throw new Error("Limiter namespace must not be empty.");
  }
}

function validateLimit(limit: number): void {
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("Limiter limit must be a positive finite number.");
  }
}

function validateTimeout(timeout: { ms: number } | false | undefined): void {
  if (timeout && (!Number.isFinite(timeout.ms) || timeout.ms <= 0)) {
    throw new Error("Limiter timeout.ms must be a positive finite number.");
  }
}

function validateIdentifier(identifier: string): void {
  if (!identifier.trim()) {
    throw new Error("Limiter identifier must not be empty.");
  }
}

function validateCost(cost: number): void {
  if (!Number.isFinite(cost) || cost <= 0) {
    throw new Error("Limiter cost must be a positive finite number.");
  }
}

function validateOptionalValue(value: string | undefined, label: string): void {
  if (value !== undefined && !value.trim()) {
    throw new Error(`Limiter ${label} must not be empty.`);
  }
}

function normalizeRateLimitResult(result: RateLimitResult): RateLimitResult {
  return {
    ...result,
    remaining: Math.max(0, result.remaining)
  };
}

function normalizeUsageLimitResult(result: UsageLimitResult): UsageLimitResult {
  return {
    ...result,
    remaining: Math.max(0, result.remaining),
    used: Math.max(0, result.used)
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export class RateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly durationMs: number;

  constructor(config: RateLimiterConfig) {
    validateNamespace(config.namespace);
    validateLimit(config.limit);
    validateTimeout(config.timeout);

    this.durationMs = parseDuration(config.duration);
    this.config = {
      ...config,
      failureMode: config.failureMode ?? "closed",
      timeout: config.timeout ?? false
    };
  }

  async limit(input: RateLimitInput): Promise<RateLimitResult> {
    validateIdentifier(input.identifier);
    validateOptionalValue(input.key, "key");

    const cost = input.cost ?? 1;
    validateCost(cost);

    const now = this.config.now?.() ?? Date.now();
    const adapterInput: RateLimitAdapterInput = {
      namespace: this.config.namespace,
      identifier: input.identifier,
      key: input.key ?? `${this.config.namespace}:${input.identifier}`,
      limit: this.config.limit,
      durationMs: this.durationMs,
      cost,
      now,
      meta: input.meta
    };

    try {
      if (this.config.timeout) {
        const result = await withTimeout(
          Promise.resolve(this.config.adapter.limit(adapterInput)),
          this.config.timeout.ms
        );

        if (!result.ok) {
          if (this.config.timeout.fallback) {
            return normalizeRateLimitResult(await this.config.timeout.fallback(adapterInput));
          }

          return normalizeRateLimitFailure(this.config, now, "timeout");
        }

        return normalizeRateLimitResult(result.value);
      }

      return normalizeRateLimitResult(await this.config.adapter.limit(adapterInput));
    } catch (error) {
      if (this.config.onError) {
        return normalizeRateLimitResult(await this.config.onError(toError(error), adapterInput));
      }

      return normalizeRateLimitFailure(this.config, now, "error");
    }
  }
}

export class UsageLimiter {
  private readonly config: UsageLimiterConfig;
  private readonly refill:
    | {
        amount: number;
        intervalMs: number;
      }
    | null;

  constructor(config: UsageLimiterConfig) {
    validateNamespace(config.namespace);
    validateLimit(config.limit);
    validateTimeout(config.timeout);

    if (config.refill) {
      if (!Number.isFinite(config.refill.amount) || config.refill.amount <= 0) {
        throw new Error("Usage limiter refill.amount must be a positive finite number.");
      }
      this.refill = {
        amount: config.refill.amount,
        intervalMs: parseDuration(config.refill.interval)
      };
    } else {
      this.refill = null;
    }

    this.config = {
      ...config,
      failureMode: config.failureMode ?? "closed",
      timeout: config.timeout ?? false
    };
  }

  async consume(input: UsageLimitInput): Promise<UsageLimitResult> {
    validateIdentifier(input.identifier);
    validateOptionalValue(input.bucket, "bucket");
    validateOptionalValue(input.key, "key");

    const cost = input.cost ?? 1;
    validateCost(cost);

    const bucket = input.bucket ?? "default";
    const now = this.config.now?.() ?? Date.now();
    const adapterInput: UsageLimitAdapterInput = {
      namespace: this.config.namespace,
      identifier: input.identifier,
      bucket,
      key: input.key ?? `${this.config.namespace}:${bucket}:${input.identifier}`,
      limit: this.config.limit,
      cost,
      now,
      refill: this.refill,
      meta: input.meta
    };

    try {
      if (this.config.timeout) {
        const result = await withTimeout(
          Promise.resolve(this.config.adapter.consume(adapterInput)),
          this.config.timeout.ms
        );

        if (!result.ok) {
          if (this.config.timeout.fallback) {
            return normalizeUsageLimitResult(await this.config.timeout.fallback(adapterInput));
          }

          return normalizeUsageLimitFailure(this.config, now, "timeout");
        }

        return normalizeUsageLimitResult(result.value);
      }

      return normalizeUsageLimitResult(await this.config.adapter.consume(adapterInput));
    } catch (error) {
      if (this.config.onError) {
        return normalizeUsageLimitResult(await this.config.onError(toError(error), adapterInput));
      }

      return normalizeUsageLimitFailure(this.config, now, "error");
    }
  }
}
