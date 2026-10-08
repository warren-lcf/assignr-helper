/** The tenant has not saved SendGrid settings, so nothing can be sent. */
export class EmailNotConfiguredError extends Error {
  public constructor() {
    super('Email sending is not configured for this tenant');
    this.name = 'EmailNotConfiguredError';
  }
}
