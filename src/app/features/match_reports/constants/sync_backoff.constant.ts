/** Wait before the first retry after a failed send, in milliseconds. */
export const BACKOFF_BASE_MS = 1000;
/** The longest wait between retries, in milliseconds. */
export const BACKOFF_CAP_MS = 30_000;
/** The first HTTP status that means the server (not the request) failed. */
export const SERVER_ERROR_STATUS = 500;
/** HTTP statuses below 500 that are still worth retrying: timeout and "slow down". */
export const RETRYABLE_CLIENT_STATUSES: readonly number[] = [408, 429];
/** Prefix of the browser storage key that holds one report's waiting edits. */
export const QUEUE_STORAGE_KEY_PREFIX = 'assignr-helper.match-report.queue.';
