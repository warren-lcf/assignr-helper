import { IApiViolation } from './api_violation.model';

/** The body of every error response from the API. */
export interface IApiErrorBody {
  /** Machine-readable code; an unknown string when the backend adds new ones. */
  code: string;
  /** Human-readable summary (English). */
  message: string;
  /** Field-level problems; empty when none apply. */
  violations: IApiViolation[];
}
