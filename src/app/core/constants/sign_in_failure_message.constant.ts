import { SignInFailure } from '../enums/sign_in_failure.enum';

/** English translation keys shown for each sign-in failure. */
export const SIGN_IN_FAILURE_MESSAGE: Record<SignInFailure, string> = {
  [SignInFailure.INVALID_CREDENTIALS]: 'The email or password is not correct.',
  [SignInFailure.TOO_MANY_ATTEMPTS]: 'Too many attempts. Wait a moment and try again.',
  [SignInFailure.CANCELLED]: 'Sign-in was cancelled.',
  [SignInFailure.UNKNOWN]: 'Sign-in failed. Try again.',
};
