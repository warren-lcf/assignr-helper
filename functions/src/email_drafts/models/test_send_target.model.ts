/** The signed-in account a test email goes to, as the verified token reports it. */
export interface ITestSendTarget {
  /** The account's email address; null when it has none. */
  email: string | null;
  /** True only when the identity provider verified the address. */
  email_verified: boolean;
}
