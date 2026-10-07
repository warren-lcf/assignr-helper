import { IRateLimiter } from './rate_limiter.interface.js';
import { IRateLimitDecision } from './rate_limit_decision.model.js';

/** Settings of a `TokenBucketRateLimiter`. */
export interface ITokenBucketRateLimiterOptions {
  /** Most units a client can hold, which is also its burst size. */
  capacity: number;
  /** Units a client earns back per minute. */
  refill_per_minute: number;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  /**
   * Most client keys remembered at once. When the table is full the least recently seen client
   * is forgotten (and so starts full again). This bounds memory against a flood of distinct addresses.
   */
  max_keys: number;
}

/** One client's allowance. */
interface IBucket {
  tokens: number;
  updated_at: number;
}

/**
 * An in-memory token-bucket rate limiter.
 *
 * Known limitation: the buckets live in one function instance's memory, so the effective limit
 * is per instance, not global, and resets when an instance is replaced. That is acceptable
 * defence in depth for a link whose tokens are unguessable. A shared store is tracked upstream
 * in hamble-creek-holdings issue #794; swap this class for one backed by it through
 * `IRateLimiter` when it ships.
 */
export class TokenBucketRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, IBucket>();

  /**
   * Creates a limiter.
   * @param options Capacity, refill rate, clock and memory bound.
   */
  public constructor(private readonly options: ITokenBucketRateLimiterOptions) {}

  /**
   * Spends one unit of the key's allowance when it has one.
   * @param key Who is being limited.
   * @returns Whether the request may go ahead and, when not, how long to wait.
   */
  public try_consume(key: string): IRateLimitDecision {
    const now = this.options.now();
    const bucket = this.refilled(key, now);
    if (bucket.tokens < 1) {
      // Keep the stored bucket as it was, so the next refill is computed from the same start
      // and fractions of a unit are never lost to rounding; only mark the client recently seen.
      const stored = this.buckets.get(key);
      if (stored) {
        this.store(key, stored);
      }
      return { allowed: false, retry_after_seconds: this.seconds_until_one(bucket) };
    }
    bucket.tokens -= 1;
    this.store(key, bucket);
    return { allowed: true, retry_after_seconds: 0 };
  }

  /**
   * Checks whether the key has a unit available, spending nothing.
   * @param key Who is being limited.
   * @returns Whether a request would be allowed right now and, when not, how long to wait.
   */
  public peek(key: string): IRateLimitDecision {
    const bucket = this.refilled(key, this.options.now());
    if (bucket.tokens < 1) {
      return { allowed: false, retry_after_seconds: this.seconds_until_one(bucket) };
    }
    return { allowed: true, retry_after_seconds: 0 };
  }

  /**
   * Reads a key's bucket brought up to date with the time that has passed.
   * @param key Who is being limited.
   * @param now Current instant in UTC milliseconds.
   * @returns A fresh bucket object; a key never seen starts full.
   */
  private refilled(key: string, now: number): IBucket {
    const existing = this.buckets.get(key);
    if (!existing) {
      return { tokens: this.options.capacity, updated_at: now };
    }
    // A clock that steps backwards must neither refund nor remove tokens.
    const elapsed_ms = Math.max(0, now - existing.updated_at);
    const earned = (elapsed_ms * this.options.refill_per_minute) / 60_000;
    return {
      tokens: Math.min(this.options.capacity, existing.tokens + earned),
      updated_at: Math.max(now, existing.updated_at),
    };
  }

  /**
   * Whole seconds until a bucket holds one unit again.
   * @param bucket A bucket with less than one unit.
   * @returns At least one second.
   */
  private seconds_until_one(bucket: IBucket): number {
    const missing = 1 - bucket.tokens;
    const minutes = missing / this.options.refill_per_minute;
    return Math.max(1, Math.ceil(minutes * 60));
  }

  /**
   * Remembers a bucket as the most recently seen, evicting the least recently seen client
   * when the table is full so memory stays bounded against a flood of distinct addresses.
   * @param key Who is being limited.
   * @param bucket Their updated bucket.
   * @returns Nothing.
   */
  private store(key: string, bucket: IBucket): void {
    // Re-insert so Map iteration order is least recently seen first.
    this.buckets.delete(key);
    while (this.buckets.size >= this.options.max_keys) {
      const oldest = this.buckets.keys().next();
      if (oldest.done) {
        break;
      }
      this.buckets.delete(oldest.value);
    }
    this.buckets.set(key, bucket);
  }
}
