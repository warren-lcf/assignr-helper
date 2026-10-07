/** Which games `GET /api/games` lists. Mirrors the backend. */
export enum GamesScope {
  /** Games still open for the referee to claim (the default). */
  OPEN = 'OPEN',
  /** Games assigned to the referee. */
  MINE = 'MINE',
  /** Open and assigned games together. */
  ALL = 'ALL',
}
