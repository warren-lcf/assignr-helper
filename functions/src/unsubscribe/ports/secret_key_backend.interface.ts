/**
 * The two operations the unsubscribe signing key needs from a secret store. Unlike a plain
 * write-a-new-version call, creation is conditional, which is what makes first-use provisioning
 * safe when several function instances start at once.
 */
export interface ISecretKeyBackend {
  /**
   * Reads the latest version of a platform-level secret.
   * @param secret_id Secret name within the project.
   * @returns The secret text, or null when the secret does not exist or has no version yet.
   * @throws Error when the store cannot be read (for example a permissions problem); that is never
   *   reported as "missing", so a misconfiguration cannot cause a second key to be created.
   */
  read(secret_id: string): Promise<string | null>;

  /**
   * Creates a secret holding `value` unless a secret with that name already exists.
   * @param secret_id Secret name within the project.
   * @param value Secret text to store as its first version.
   * @returns True when this call created the secret; false when it already existed (it may not
   *   have its first version yet if another instance is still writing it).
   */
  create_if_absent(secret_id: string, value: string): Promise<boolean>;
}
