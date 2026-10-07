/** Whether a connection to a scheduling provider can be used. */
export enum ConnectionStatus {
  /** Authorized and eligible for syncing. */
  CONNECTED = 'CONNECTED',
  /** Authorization failed or expired; the owner must reconnect. Never synced automatically. */
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
  /** Removed by the owner. */
  DISCONNECTED = 'DISCONNECTED',
}
