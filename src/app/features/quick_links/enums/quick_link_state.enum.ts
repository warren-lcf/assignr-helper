/** Whether a quick link can be used right now, as the API reports it. Mirrors the backend. */
export enum QuickLinkState {
  /** The link works. */
  ACTIVE = 'ACTIVE',
  /** The link's expiry has passed. */
  EXPIRED = 'EXPIRED',
  /** The link was revoked by hand. */
  REVOKED = 'REVOKED',
}
