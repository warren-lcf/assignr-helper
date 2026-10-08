/** What the send confirmation dialog is told. All of it is what the sender was shown on the preview. */
export interface ISendDialogData {
  draft_id: string;
  subject: string;
  /** The number the sender confirms; sent to the server as confirm_recipient_count. */
  recipient_count: number;
  /** Display names of the first few recipients (never addresses). */
  recipient_names: string[];
  /** How many recipients are not named in recipient_names. */
  more_recipient_count: number;
  game_count: number;
  include_quick_link: boolean;
  quick_link_expiry_days: number;
  /** True when this retries people an earlier send did not reach. */
  is_retry: boolean;
}
