import { SignInFailure } from '../../enums/sign_in_failure.enum';

const INVALID_CREDENTIAL_CODES = new Set([
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-email',
]);

const CANCELLED_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

/**
 * Maps a Firebase Auth error to a sign-in failure reason.
 * @param error Anything thrown by a sign-in attempt.
 * @returns The failure reason; UNKNOWN when the code is not recognised.
 */
export function map_sign_in_failure(error: unknown): SignInFailure {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code !== 'string') return SignInFailure.UNKNOWN;
  if (INVALID_CREDENTIAL_CODES.has(code)) return SignInFailure.INVALID_CREDENTIALS;
  if (code === 'auth/too-many-requests') return SignInFailure.TOO_MANY_ATTEMPTS;
  if (CANCELLED_CODES.has(code)) return SignInFailure.CANCELLED;
  return SignInFailure.UNKNOWN;
}
