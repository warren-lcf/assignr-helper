import { getAuth } from 'firebase-admin/auth';
import { IVerifiedToken } from './models/verified_token.model.js';
import { ITokenVerifier } from './ports/token_verifier.interface.js';

/** The slice of the Firebase Admin Auth API this verifier uses; lets specs pass a fake. */
export interface IFirebaseAuthLike {
  // Mirrors the Firebase Admin SDK method name so the real `getAuth()` is assignable.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  verifyIdToken: (
    token: string,
    check_revoked?: boolean,
  ) => Promise<{ uid: string; email?: string | undefined }>;
}

/** Error codes that mean "this token is not acceptable" rather than "verification could not run". */
const REJECTED_TOKEN_CODES = new Set([
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/argument-error',
  'auth/user-disabled',
]);

/**
 * Verifies Firebase ID tokens with the Admin SDK, checking revocation. A token
 * that is bad (expired, revoked, malformed, user disabled) yields null; an
 * error that is not about the token itself (network, SDK failure) is thrown so
 * the caller can answer 503 instead of wrongly telling the user to sign in again.
 */
export class FirebaseTokenVerifier implements ITokenVerifier {
  public constructor(private readonly auth: () => IFirebaseAuthLike = () => getAuth()) {}

  /** @inheritdoc */
  public async verify(token: string): Promise<IVerifiedToken | null> {
    try {
      const decoded = await this.auth().verifyIdToken(token, true);
      return { uid: decoded.uid, email: decoded.email ?? null };
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (typeof code === 'string' && REJECTED_TOKEN_CODES.has(code)) return null;
      throw error;
    }
  }
}
