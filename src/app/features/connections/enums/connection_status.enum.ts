/** Where a connection stands, as the API reports it. */
export enum ConnectionStatus {
  /** Credentials are stored and the last use succeeded. */
  CONNECTED = 'CONNECTED',
  /** The provider rejected the credentials, or none are stored; syncing is paused. */
  NEEDS_ATTENTION = 'NEEDS_ATTENTION',
  /** The tenant disconnected it; the stored credentials were deleted. */
  DISCONNECTED = 'DISCONNECTED',
}
