/** One finished email for one recipient. */
export interface IOutboundEmail {
  /** Recipient; already validated with `parse_email_address`. */
  to_email: string;
  /** Subject line without line breaks. */
  subject: string;
  /** Plain-text body. */
  text: string;
  /** HTML body with every dynamic value already escaped. */
  html: string;
  /** Display name beside the sender address. */
  from_name: string | null;
  /** Address replies go to. */
  reply_to: string | null;
}
