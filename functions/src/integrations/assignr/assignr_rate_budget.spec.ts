import { describe, expect, it } from 'vitest';
import { AssignrRateBudget } from './assignr_rate_budget.js';

function make_clock() {
  const state = { now: 1_000_000, slept: [] as number[] };
  return {
    state,
    options: {
      now: () => state.now,
      sleep: async (ms: number) => {
        state.slept.push(ms);
        state.now += ms;
      },
    },
  };
}

describe('AssignrRateBudget', () => {
  it('lets requests through without waiting while under every limit', async () => {
    const clock = make_clock();
    const budget = new AssignrRateBudget(clock.options);

    for (let count = 0; count < 100; count++) await budget.acquire();

    expect(clock.state.slept).toEqual([]);
  });

  it('waits for the per-minute window once 90% of 180 is spent', async () => {
    const clock = make_clock();
    const budget = new AssignrRateBudget(clock.options);

    for (let count = 0; count < 162; count++) await budget.acquire();
    expect(clock.state.slept).toEqual([]);

    await budget.acquire();

    expect(clock.state.slept.length).toBeGreaterThan(0);
    expect(clock.state.slept[0]).toBeGreaterThanOrEqual(59_000);
  });

  it('blocks all callers when the vendor reports zero remaining', async () => {
    const clock = make_clock();
    const budget = new AssignrRateBudget(clock.options);
    budget.observe(
      new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-seconds-remaining': '12' }),
    );

    await budget.acquire();

    expect(clock.state.slept).toEqual([12_000]);
    expect(budget.last_remaining).toBe(0);
  });

  it('records remaining without blocking when requests are left', async () => {
    const clock = make_clock();
    const budget = new AssignrRateBudget(clock.options);
    budget.observe(
      new Headers({ 'x-ratelimit-remaining': '77', 'x-ratelimit-reset-seconds-remaining': '30' }),
    );

    await budget.acquire();

    expect(budget.last_remaining).toBe(77);
    expect(clock.state.slept).toEqual([]);
  });

  it('ignores responses without rate-limit headers', () => {
    const budget = new AssignrRateBudget(make_clock().options);
    budget.observe(new Headers());

    expect(budget.last_remaining).toBeNull();
  });

  it('honours an explicit block after a 429', async () => {
    const clock = make_clock();
    const budget = new AssignrRateBudget(clock.options);
    budget.block_for(5_000);

    await budget.acquire();

    expect(clock.state.slept).toEqual([5_000]);
  });
});
