import { SignInFailure } from '../../enums/sign_in_failure.enum';
import { map_sign_in_failure } from './map_sign_in_failure';

describe('map_sign_in_failure', () => {
  it.each([
    ['auth/invalid-credential', SignInFailure.INVALID_CREDENTIALS],
    ['auth/wrong-password', SignInFailure.INVALID_CREDENTIALS],
    ['auth/user-not-found', SignInFailure.INVALID_CREDENTIALS],
    ['auth/invalid-email', SignInFailure.INVALID_CREDENTIALS],
    ['auth/too-many-requests', SignInFailure.TOO_MANY_ATTEMPTS],
    ['auth/popup-closed-by-user', SignInFailure.CANCELLED],
    ['auth/cancelled-popup-request', SignInFailure.CANCELLED],
    ['auth/network-request-failed', SignInFailure.UNKNOWN],
  ])('maps %s', (code, expected) => {
    expect(map_sign_in_failure({ code })).toBe(expected);
  });

  it.each([null, undefined, 'boom', {}, { code: 7 }])('returns UNKNOWN for %j', (error) => {
    expect(map_sign_in_failure(error)).toBe(SignInFailure.UNKNOWN);
  });
});
