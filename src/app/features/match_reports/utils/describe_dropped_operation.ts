import { MAX_INCIDENTS } from '../constants/match_report_limits.constant';
import { MatchReportErrorCode } from '../enums/match_report_error_code.enum';
import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { IDroppedOperation } from '../models/dropped_operation.model';

/**
 * The sentence shown when the queue gives up on an edit.
 * @param dropped The edit that was dropped.
 * @param translate Translates an English key.
 * @returns A translated message saying what was not saved and what to do.
 */
export function describe_dropped_operation(
  dropped: IDroppedOperation,
  translate: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (dropped.code === MatchReportErrorCode.REPORT_NOT_EDITABLE) {
    return translate('This report is locked, so a change was not saved. Reopen it to edit.');
  }
  if (dropped.code === MatchReportErrorCode.TOO_MANY_INCIDENTS) {
    return translate('A report holds at most {{count}} cards, so the last card was not saved.', {
      count: MAX_INCIDENTS,
    });
  }
  if (dropped.reason === ReportErrorKind.NOT_FOUND) {
    return translate('This report no longer exists, so a change was not saved.');
  }
  return translate('A change could not be saved. Check the report and enter it again.');
}
