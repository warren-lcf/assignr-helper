/** Source of the secret keys unsubscribe tokens are signed and checked with. */
export interface IUnsubscribeKeyProvider {
  /** The key version new tokens are signed with. */
  readonly current_version: number;

  /**
   * Gets the key new tokens are signed with.
   * @returns The key bytes.
   * @throws UnsubscribeKeyUnavailableError when the key cannot be read or created, so nothing is
   *   ever signed with a guessed or empty key.
   */
  get_signing_key(): Promise<Buffer>;

  /**
   * Gets the key for checking a token that names a key version.
   * @param version Version byte taken from the token.
   * @returns The key, or null when that version is not one this app knows (the token is then
   *   simply not valid).
   * @throws UnsubscribeKeyUnavailableError when a known version's key cannot be read.
   */
  get_verification_key(version: number): Promise<Buffer | null>;
}
