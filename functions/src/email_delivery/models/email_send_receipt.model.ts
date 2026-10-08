/** The vendor's acknowledgement of an accepted email. */
export interface IEmailSendReceipt {
  /** The vendor's id for the message, for matching later delivery events; null when it gave none. */
  provider_message_id: string | null;
}
