/** Why a score value was rejected. */
export enum ScoreValidationCode {
  /** The value is null or undefined. */
  MISSING = 'MISSING',
  /** The value is not a finite whole number. */
  NOT_INTEGER = 'NOT_INTEGER',
  /** The value is a whole number outside 0 to 99. */
  OUT_OF_RANGE = 'OUT_OF_RANGE',
}
