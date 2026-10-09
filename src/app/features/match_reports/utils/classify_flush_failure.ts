import { HttpErrorResponse } from '@angular/common/http';
import { RETRYABLE_CLIENT_STATUSES, SERVER_ERROR_STATUS } from '../constants/sync_backoff.constant';
import { FlushFailure } from '../enums/flush_failure.enum';
import { MatchReportErrorCode } from '../enums/match_report_error_code.enum';
import { classify_report_error } from './classify_report_error';

/**
 * Decides what the offline queue does with an edit the server did not accept. No connection (status 0), a
 * server error, a timeout or "slow down" can pass, so the edit stays and is tried again. Any other refusal
 * (locked report, bad value, unknown report) will be refused again, so the edit is dropped. The exception is
 * REPORT_CONFLICT (the server lost its compare-and-swap five times), a 409 that is worth another go, like a 5xx. An
 * error that is not an HTTP answer at all is a bug, and retrying it forever would hide it, so it is dropped too.
 * @param error What sending the edit threw.
 * @returns Whether to keep the edit or drop it.
 */
export function classify_flush_failure(error: unknown): FlushFailure {
  if (!(error instanceof HttpErrorResponse)) return FlushFailure.DROP;
  if (error.status === 0 || error.status >= SERVER_ERROR_STATUS) return FlushFailure.RETRY;
  if (classify_report_error(error).code === MatchReportErrorCode.REPORT_CONFLICT) {
    return FlushFailure.RETRY;
  }
  return RETRYABLE_CLIENT_STATUSES.includes(error.status) ? FlushFailure.RETRY : FlushFailure.DROP;
}
