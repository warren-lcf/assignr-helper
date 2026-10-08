import { IViolation } from '../../http/models/violation.model.js';

/** A draft refers to something that does not exist or is not allowed, found after the body parsed. */
export class DraftValidationError extends Error {
  public constructor(public readonly violations: IViolation[]) {
    super('The email draft is not valid');
    this.name = 'DraftValidationError';
  }
}
