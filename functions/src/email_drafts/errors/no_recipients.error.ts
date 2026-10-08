/** Nobody is eligible to receive the email. */
export class NoRecipientsError extends Error {
  public constructor() {
    super('There are no recipients who can be emailed');
    this.name = 'NoRecipientsError';
  }
}
