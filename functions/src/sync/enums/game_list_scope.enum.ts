/** Which of a tenant's stored games a listing selects. */
export enum GameListScope {
  /** Games last seen on an open-games list. */
  OPEN = 'OPEN',
  /** Games last seen on the account's own list. */
  MINE = 'MINE',
  /** Games that are open or mine. */
  ALL = 'ALL',
}
