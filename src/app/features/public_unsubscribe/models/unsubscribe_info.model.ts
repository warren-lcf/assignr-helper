/** What the unsubscribe link says about itself: the address it is for, partly hidden, and whether it was already used. */
export interface IUnsubscribeInfo {
  /** The email address with its middle hidden, such as j***@example.com. */
  email_masked: string;
  /** True when this address already unsubscribed. */
  already_unsubscribed: boolean;
}
