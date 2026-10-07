/** What a sync run pulls. */
export enum SyncKind {
  /** Organizations (sites). Cheap and slow-changing. */
  REFERENCE_DATA = 'REFERENCE_DATA',
  /** Games open to claim. */
  OPEN_GAMES = 'OPEN_GAMES',
  /** Games assigned to the connected account. */
  MY_GAMES = 'MY_GAMES',
}
