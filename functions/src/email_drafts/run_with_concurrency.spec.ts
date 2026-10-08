import { describe, expect, it } from 'vitest';
import { run_with_concurrency } from './run_with_concurrency.js';

/**
 * Waits one turn of the event loop.
 * @returns A promise that resolves after a macrotask.
 */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('run_with_concurrency', () => {
  it('processes every item, starting them in order', async () => {
    const started: number[] = [];

    await run_with_concurrency([1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      await tick();
    });

    expect(started).toEqual([1, 2, 3, 4, 5]);
  });

  it('never runs more than the limit at once', async () => {
    let running = 0;
    let peak = 0;

    await run_with_concurrency(
      Array.from({ length: 20 }, (_, i) => i),
      5,
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await tick();
        running -= 1;
      },
    );

    expect(peak).toBe(5);
  });

  it('runs one at a time for a limit below one', async () => {
    let running = 0;
    let peak = 0;

    await run_with_concurrency([1, 2, 3], 0, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      running -= 1;
    });

    expect(peak).toBe(1);
  });

  it('does nothing for no items', async () => {
    await expect(run_with_concurrency([], 5, async () => undefined)).resolves.toBeUndefined();
  });

  it('finishes every item even when one throws, then rethrows the first error', async () => {
    const done: number[] = [];

    await expect(
      run_with_concurrency([1, 2, 3, 4], 2, async (n) => {
        if (n === 2) throw new Error('boom 2');
        if (n === 3) throw new Error('boom 3');
        done.push(n);
      }),
    ).rejects.toThrow('boom 2');

    expect(done.sort()).toEqual([1, 4]);
  });
});
