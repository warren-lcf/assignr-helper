import { IRateLimitDecision } from './rate_limit_decision.model.js';

/** Counts requests per client key and says when a client has used up its allowance. */
export interface IRateLimiter {
  /**
   * Spends one unit of the key's allowance.
   * @param key Who is being limited, for example a client IP address.
   * @returns Whether the request may go ahead and, when not, how long to wait.
   */
  try_consume(key: string): IRateLimitDecision;

  /**
   * Checks the key's allowance without spending any.
   * @param key Who is being limited.
   * @returns Whether a request would be allowed right now and, when not, how long to wait.
   */
  peek(key: string): IRateLimitDecision;
}
