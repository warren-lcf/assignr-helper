import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';

/** An edit the server refused for good, so the queue gave up on it. */
export interface IDroppedOperation {
  kind: ReportOperationKind;
  /** Why it was refused, as far as the screen distinguishes. */
  reason: ReportErrorKind;
  /** The API's error code, when it sent one. */
  code: string | null;
}
