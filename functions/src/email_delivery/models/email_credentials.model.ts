/** What is needed to send through a tenant's own SendGrid account. */
export interface IEmailCredentials {
  api_key: string;
  /** Verified sender address. */
  from_email: string;
}
