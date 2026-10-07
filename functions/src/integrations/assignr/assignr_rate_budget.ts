/** One sliding window of the Assignr rate limits. */
interface IRateWindow {
  limit: number;
  window_ms: number;
}

/** Assignr's documented limits: 180/min, 500 per 5 min, 5000/hour. */
const ASSIGNR_RATE_WINDOWS: IRateWindow[] = [
  { limit: 180, window_ms: 60_000 },
  { limit: 500, window_ms: 300_000 },
  { limit: 5000, window_ms: 3_600_000 },
];

/** Fraction of each limit this budget will spend, leaving headroom for other callers. */
const SAFETY_FACTOR = 0.9;

/** Dependencies injected so the budget is deterministic under test. */
export interface IAssignrRateBudgetOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Per-connection outbound request budget. `acquire` waits until a request fits
 * inside every sliding window; `observe` honours the vendor's own
 * `X-Ratelimit-*` response headers so a drained budget pauses all callers.
 */
export class AssignrRateBudget {
  private readonly timestamps: number[] = [];
  private blocked_until = 0;
  private remaining: number | null = null;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  public constructor(options: IAssignrRateBudgetOptions = {}) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Last `X-Ratelimit-Remaining` seen, for the sync-run log.
   * @returns The remaining request count, or null before any response.
   */
  public get last_remaining(): number | null {
    return this.remaining;
  }

  /**
   * Waits until one more request is allowed, then reserves it.
   * @returns Resolves when the caller may send its request.
   */
  public async acquire(): Promise<void> {
    for (;;) {
      const wait_ms = this.required_wait();
      if (wait_ms <= 0) {
        this.timestamps.push(this.now());
        return;
      }
      await this.sleep(wait_ms);
    }
  }

  /**
   * Reads the vendor's rate-limit headers from a response.
   * @param headers Response headers.
   * @returns Nothing; may block further requests until the window resets.
   */
  public observe(headers: Headers): void {
    const remaining = Number(headers.get('x-ratelimit-remaining'));
    const reset_seconds = Number(headers.get('x-ratelimit-reset-seconds-remaining'));
    if (headers.get('x-ratelimit-remaining') !== null && Number.isFinite(remaining)) {
      this.remaining = remaining;
      if (remaining <= 0 && Number.isFinite(reset_seconds) && reset_seconds > 0) {
        this.blocked_until = this.now() + reset_seconds * 1000;
      }
    }
  }

  /**
   * Blocks all callers for a fixed time, used after a 429.
   * @param ms Milliseconds to block.
   * @returns Nothing.
   */
  public block_for(ms: number): void {
    this.blocked_until = Math.max(this.blocked_until, this.now() + ms);
  }

  private required_wait(): number {
    const now = this.now();
    let wait_ms = Math.max(0, this.blocked_until - now);
    const longest_window = ASSIGNR_RATE_WINDOWS[ASSIGNR_RATE_WINDOWS.length - 1].window_ms;
    while (this.timestamps.length > 0 && this.timestamps[0] <= now - longest_window) {
      this.timestamps.shift();
    }
    for (const rate_window of ASSIGNR_RATE_WINDOWS) {
      const allowed = Math.floor(rate_window.limit * SAFETY_FACTOR);
      const in_window = this.timestamps.filter((at) => at > now - rate_window.window_ms);
      if (in_window.length >= allowed) {
        const oldest_blocking = in_window[in_window.length - allowed];
        wait_ms = Math.max(wait_ms, oldest_blocking + rate_window.window_ms - now + 1);
      }
    }
    return wait_ms;
  }
}
