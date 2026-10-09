import { ReadyBlocker } from '../../domain/match_reports/ready_blocker.enum.js';
import { IViolation } from '../../http/models/violation.model.js';

/** The report cannot be marked READY yet; the blockers say why. */
export class ReportNotReadyError extends Error {
  public constructor(
    public readonly report_id: string,
    public readonly blockers: ReadyBlocker[],
    public readonly violations: IViolation[],
  ) {
    super(`Match report ${report_id} is not ready`);
    this.name = 'ReportNotReadyError';
  }
}
