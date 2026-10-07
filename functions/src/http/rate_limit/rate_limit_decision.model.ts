/** The answer of a rate limiter. */
export interface IRateLimitDecision {
  /** True when the request may go ahead. */
  allowed: boolean;
  /** Whole seconds until at least one unit is available again; 0 when allowed. */
  retry_after_seconds: number;
}
