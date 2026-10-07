import { describe, expect, it } from 'vitest';
import { TokenBucketRateLimiter } from './token_bucket_rate_limiter.js';

/**
 * Builds a limiter with a clock the spec moves.
 * @param overrides Settings to replace.
 * @returns The limiter and a function that moves the clock.
 */
function make_limiter(
  overrides: { capacity?: number; refill_per_minute?: number; max_keys?: number } = {},
) {
  let time = 1_000_000;
  const limiter = new TokenBucketRateLimiter({
    capacity: 3,
    refill_per_minute: 6,
    max_keys: 100,
    now: () => time,
    ...overrides,
  });
  return {
    limiter,
    advance: (ms: number) => {
      time += ms;
    },
    rewind: (ms: number) => {
      time -= ms;
    },
  };
}

describe('TokenBucketRateLimiter', () => {
  it('allows a burst up to its capacity and then refuses with a wait time', () => {
    const { limiter } = make_limiter();

    expect([1, 2, 3].map(() => limiter.try_consume('ip').allowed)).toEqual([true, true, true]);

    expect(limiter.try_consume('ip')).toEqual({ allowed: false, retry_after_seconds: 10 });
  });

  it('refills over time at the configured rate', () => {
    const { limiter, advance } = make_limiter();
    for (let i = 0; i < 3; i++) limiter.try_consume('ip');

    advance(9_000);
    expect(limiter.try_consume('ip').allowed).toBe(false);
    advance(1_000);

    expect(limiter.try_consume('ip').allowed).toBe(true);
    expect(limiter.try_consume('ip').allowed).toBe(false);
  });

  it('never refills beyond its capacity', () => {
    const { limiter, advance } = make_limiter();
    limiter.try_consume('ip');

    advance(10 * 60_000);

    expect([1, 2, 3, 4].map(() => limiter.try_consume('ip').allowed)).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  it('tracks each key separately', () => {
    const { limiter } = make_limiter();
    for (let i = 0; i < 3; i++) limiter.try_consume('a');

    expect(limiter.try_consume('a').allowed).toBe(false);
    expect(limiter.try_consume('b').allowed).toBe(true);
  });

  it('peek reports the allowance without spending it', () => {
    const { limiter } = make_limiter({ capacity: 1 });

    expect(limiter.peek('ip').allowed).toBe(true);
    expect(limiter.peek('ip').allowed).toBe(true);
    limiter.try_consume('ip');

    expect(limiter.peek('ip')).toEqual({ allowed: false, retry_after_seconds: 10 });
  });

  it('rounds a partial wait up to a whole second and never reports less than one', () => {
    const { limiter, advance } = make_limiter({ capacity: 1, refill_per_minute: 60 });
    limiter.try_consume('ip');

    advance(400);

    expect(limiter.try_consume('ip')).toEqual({ allowed: false, retry_after_seconds: 1 });
  });

  it('does not refund or remove tokens when the clock steps backwards', () => {
    const { limiter, rewind } = make_limiter();
    for (let i = 0; i < 3; i++) limiter.try_consume('ip');

    rewind(60_000);

    expect(limiter.try_consume('ip').allowed).toBe(false);
  });

  it('remembers at most max_keys clients, forgetting the least recently seen first', () => {
    const { limiter } = make_limiter({ capacity: 1, max_keys: 2 });
    limiter.try_consume('a');
    limiter.try_consume('b');
    limiter.try_consume('a');

    limiter.try_consume('c');

    // "b" was the least recently seen, so it was forgotten and starts full again.
    expect(limiter.peek('b').allowed).toBe(true);
    // "a" and "c" are still remembered with their spent allowance.
    expect(limiter.peek('c').allowed).toBe(false);
    expect(limiter.peek('a').allowed).toBe(false);
  });
});
