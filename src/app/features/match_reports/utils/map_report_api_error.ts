import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { IMappedReportError } from '../models/mapped_report_error.model';
import { classify_report_error } from './classify_report_error';

/**
 * Turns a failed match report call into the heading and advice the screen shows. The server's English
 * wording is never shown; every message is the app's own translated text.
 * @param error Whatever the call (or the resource around it) threw.
 * @param translate Translates an English key.
 * @returns The kind of failure and its messages.
 */
export function map_report_api_error(
  error: unknown,
  translate: (key: string) => string,
): IMappedReportError {
  const { kind } = classify_report_error(error);
  switch (kind) {
    case ReportErrorKind.TENANT_REQUIRED:
      return {
        kind,
        headline: translate('Choose a tenant first'),
        description: translate('Pick the tenant to act in from the header, then try again.'),
      };
    case ReportErrorKind.PERMISSION_REQUIRED:
      return {
        kind,
        headline: translate('You do not have access to match reports'),
        description: translate('Ask a tenant owner to give your role access to match reports.'),
      };
    case ReportErrorKind.GAME_CANCELLED:
      return {
        kind,
        headline: translate('This game was cancelled'),
        description: translate('A cancelled game has no match report.'),
      };
    case ReportErrorKind.NOT_FOUND:
      return {
        kind,
        headline: translate('This game is not one of yours'),
        description: translate('Only games you are assigned to have a match report.'),
      };
    default:
      return {
        kind,
        headline: translate('The match report could not be loaded'),
        description: translate('Check your connection and try again.'),
      };
  }
}
