/** What the public unsubscribe page may show: a masked address and whether it is already done. */
export interface IUnsubscribePreview {
  /** The address, masked (`j***@e***.com`); the full address is never shown on a public page. */
  email_masked: string;
  already_unsubscribed: boolean;
}
