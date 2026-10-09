import { ReportErrorKind } from '../enums/report_error_kind.enum';

/** A failed match report call translated for the screen. */
export interface IMappedReportError {
  kind: ReportErrorKind;
  /** Short, translated heading. */
  headline: string;
  /** Translated explanation of what to do. */
  description: string;
}
