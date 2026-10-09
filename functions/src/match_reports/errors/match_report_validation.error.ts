import { IViolation } from '../../http/models/violation.model.js';

/** An edit was refused by the domain rules after the body parsed. */
export class MatchReportValidationError extends Error {
  public constructor(public readonly violations: IViolation[]) {
    super('The match report edit is not valid');
    this.name = 'MatchReportValidationError';
  }
}
