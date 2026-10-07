/** What the provider says about the account a set of credentials belongs to. */
export interface IVerifiedAccount {
  /** The provider's own id for the account. */
  external_account_id: string;
  /** A display name for the account, when the provider supplies one. */
  label: string | null;
}
