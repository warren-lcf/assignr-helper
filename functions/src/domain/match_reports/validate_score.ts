import { IScoreValidation } from './score_validation.model.js';
import { ScoreValidationCode } from './score_validation_code.enum.js';

const MIN_SCORE = 0;
const MAX_SCORE = 99;

/**
 * Validates a goal count.
 * @param value Candidate score of unknown type (for example parsed JSON).
 * @returns Valid for a whole number from 0 to 99; otherwise the reason code.
 */
export function validate_score(value: unknown): IScoreValidation {
  if (value === null || value === undefined) {
    return { valid: false, code: ScoreValidationCode.MISSING };
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { valid: false, code: ScoreValidationCode.NOT_INTEGER };
  }
  if (value < MIN_SCORE || value > MAX_SCORE) {
    return { valid: false, code: ScoreValidationCode.OUT_OF_RANGE };
  }
  return { valid: true, code: null };
}
