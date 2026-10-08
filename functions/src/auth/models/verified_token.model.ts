/** The facts the app trusts from a verified ID token. */
export interface IVerifiedToken {
  uid: string;
  email: string | null;
  /** True when the identity provider has verified the address. Absent when it did not say. */
  email_verified?: boolean;
}
