/** Why a sign-in attempt did not succeed. */
export enum SignInFailure {
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOO_MANY_ATTEMPTS = 'TOO_MANY_ATTEMPTS',
  CANCELLED = 'CANCELLED',
  UNKNOWN = 'UNKNOWN',
}
