/** What one sync run pulls from the provider. */
export enum SyncKind {
  /** Organizations and venues. */
  REFERENCE_DATA = 'REFERENCE_DATA',
  /** Games open for the referee to claim. */
  OPEN_GAMES = 'OPEN_GAMES',
  /** Games assigned to the connected account. */
  MY_GAMES = 'MY_GAMES',
}
