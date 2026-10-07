import { SignInFailure } from '../enums/sign_in_failure.enum';

/** Outcome of a sign-in attempt. `failure` is null on success. */
export interface ISignInResult {
  ok: boolean;
  failure: SignInFailure | null;
}
