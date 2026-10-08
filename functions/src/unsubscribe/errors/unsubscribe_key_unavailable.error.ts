/**
 * The secret key unsubscribe links are signed with could not be read or created. The message
 * says what to do but never includes the key or the underlying store's response.
 */
export class UnsubscribeKeyUnavailableError extends Error {
  public constructor(options?: { cause?: unknown }) {
    super(
      'The unsubscribe signing key is not available. Check that the runtime service account can ' +
        'read and create secrets in the Secret Manager project, or create the secret named ' +
        'assignr-helper-unsubscribe-key-v1 by hand (see the project notes).',
      options,
    );
    this.name = 'UnsubscribeKeyUnavailableError';
  }
}
