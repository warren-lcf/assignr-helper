/** Where the "copy this link" action stands. */
export enum CopyStatus {
  /** Nothing has been copied yet. */
  IDLE = 'IDLE',
  /** The link is on the clipboard. */
  COPIED = 'COPIED',
  /** The browser refused; the link has to be copied by hand. */
  FAILED = 'FAILED',
}
