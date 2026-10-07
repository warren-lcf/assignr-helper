import { describe, expect, it } from 'vitest';
import { ScoreValidationCode } from './score_validation_code.enum.js';
import { validate_score } from './validate_score.js';

describe('validate_score', () => {
  it.each([0, 1, 50, 99])('accepts %s', (value) => {
    expect(validate_score(value)).toEqual({ valid: true, code: null });
  });

  it('accepts negative zero as zero', () => {
    expect(validate_score(-0).valid).toBe(true);
  });

  it.each([null, undefined])('reports MISSING for %s', (value) => {
    expect(validate_score(value)).toEqual({ valid: false, code: ScoreValidationCode.MISSING });
  });

  it.each([1.5, NaN, Infinity, -Infinity, '3', true, {}, []])(
    'reports NOT_INTEGER for %s',
    (value) => {
      expect(validate_score(value)).toEqual({
        valid: false,
        code: ScoreValidationCode.NOT_INTEGER,
      });
    },
  );

  it.each([-1, 100, 1000])('reports OUT_OF_RANGE for %s', (value) => {
    expect(validate_score(value)).toEqual({
      valid: false,
      code: ScoreValidationCode.OUT_OF_RANGE,
    });
  });
});
