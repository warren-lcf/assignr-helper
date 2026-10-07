import { ScoreValidationCode } from './score_validation_code.enum.js';

/** Outcome of validating a score. */
export interface IScoreValidation {
  valid: boolean;
  /** Null when valid. */
  code: ScoreValidationCode | null;
}
