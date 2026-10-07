/** How long a new quick link lives, as offered in the create dialog. */
export enum QuickLinkExpiryPreset {
  /** No expiry: the link works until it is revoked. */
  NEVER = 'NEVER',
  /** Seven days from creation. */
  DAYS_7 = 'DAYS_7',
  /** Thirty days from creation. */
  DAYS_30 = 'DAYS_30',
  /** Ninety days from creation. */
  DAYS_90 = 'DAYS_90',
}
