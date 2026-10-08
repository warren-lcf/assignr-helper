/**
 * A tenant's email sending settings as kept in Secret Manager (one JSON secret per tenant). The
 * API key is a secret: it lives only there and is never returned, logged or put in an audit row.
 */
export interface IStoredEmailSettings {
  /** SendGrid API key. */
  api_key: string;
  /** Address emails are sent from; must be a sender SendGrid has verified. */
  from_email: string;
  /** Display name beside the sender address. */
  from_name: string | null;
  /** Address replies go to, when different from the sender. */
  reply_to: string | null;
  /** The sender's postal address, shown in every email footer (required by anti-spam law). */
  postal_address: string | null;
}
