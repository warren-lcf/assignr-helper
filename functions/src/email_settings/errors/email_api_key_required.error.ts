/** Email is not configured yet, so saving settings needs an API key. */
export class EmailApiKeyRequiredError extends Error {
  public constructor() {
    super('An API key is required until email sending is configured');
    this.name = 'EmailApiKeyRequiredError';
  }
}
