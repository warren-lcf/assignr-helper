import { BACKOFF_BASE_MS, BACKOFF_CAP_MS } from '../constants/sync_backoff.constant';

/**
 * How long to wait before the next send after failures: doubling from one second, never more than 30.
 * @param failed_attempts How many sends in a row have failed (1 for the first failure).
 * @returns The wait in milliseconds.
 */
export function backoff_delay(failed_attempts: number): number {
  const exponent = Math.max(0, failed_attempts - 1);
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** exponent);
}
