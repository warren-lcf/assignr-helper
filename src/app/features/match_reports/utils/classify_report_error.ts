import { ApiErrorCode } from '../../connections/enums/api_error_code.enum';
import { parse_api_error } from '../../connections/services/parse_api_error';
import { MatchReportErrorCode } from '../enums/match_report_error_code.enum';
import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { unwrap_http_error } from './unwrap_http_error';

/**
 * Sorts a failed match report call into the kinds of failure the screens tell apart.
 * @param error Whatever the call (or the resource around it) threw.
 * @returns The kind of failure, and the API's error code when it sent one.
 */
export function classify_report_error(error: unknown): {
  kind: ReportErrorKind;
  code: string | null;
} {
  const code = parse_api_error(unwrap_http_error(error))?.code ?? null;
  switch (code) {
    case ApiErrorCode.TENANT_REQUIRED:
      return { kind: ReportErrorKind.TENANT_REQUIRED, code };
    case ApiErrorCode.PERMISSION_REQUIRED:
      return { kind: ReportErrorKind.PERMISSION_REQUIRED, code };
    case MatchReportErrorCode.GAME_CANCELLED:
      return { kind: ReportErrorKind.GAME_CANCELLED, code };
    case ApiErrorCode.NOT_FOUND:
      return { kind: ReportErrorKind.NOT_FOUND, code };
    default:
      return { kind: ReportErrorKind.GENERIC, code };
  }
}
