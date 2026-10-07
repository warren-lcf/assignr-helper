import { IVerifiedToken } from '../models/verified_token.model.js';

/** Port that verifies a bearer ID token. */
export interface ITokenVerifier {
  /**
   * Verifies a token's signature, expiry and revocation.
   * @param token Raw ID token from the Authorization header.
   * @returns The verified identity, or null when the token is invalid, expired or revoked.
   * @throws When verification itself could not run (for example the provider is unreachable).
   */
  verify(token: string): Promise<IVerifiedToken | null>;
}
