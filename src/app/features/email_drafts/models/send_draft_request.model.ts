/** Body of the send draft request. */
export interface ISendDraftRequest {
  /** The number of recipients the sender was shown and agreed to. The server refuses the send when it differs. */
  confirm_recipient_count: number;
}
