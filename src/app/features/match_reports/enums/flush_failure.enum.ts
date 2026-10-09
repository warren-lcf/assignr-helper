/** What the offline queue does with an edit the server did not accept. */
export enum FlushFailure {
  /** Keep the edit and try again later: no connection, a server error or a busy server. */
  RETRY = 'RETRY',
  /** Retrying cannot help: drop the edit and tell the referee. */
  DROP = 'DROP',
}
