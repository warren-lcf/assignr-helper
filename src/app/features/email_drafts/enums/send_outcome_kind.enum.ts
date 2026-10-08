/** How the send confirmation dialog ended. */
export enum SendOutcomeKind {
  /** The send ran; the outcome carries its result. */
  SENT = 'SENT',
  /** The number of recipients changed since the preview; nothing was sent. */
  COUNT_CHANGED = 'COUNT_CHANGED',
  /** The draft is no longer a draft (another send got there first); nothing was sent. */
  LOCKED = 'LOCKED',
}
