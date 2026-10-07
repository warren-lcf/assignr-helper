/** The facts the app trusts from a verified ID token. */
export interface IVerifiedToken {
  uid: string;
  email: string | null;
}
