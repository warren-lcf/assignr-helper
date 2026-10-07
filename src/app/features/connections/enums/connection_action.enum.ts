/** Actions a connection card offers; used to show which one is in flight. */
export enum ConnectionAction {
  /** Sync the connection now. */
  SYNC = 'SYNC',
  /** Test the stored credentials. */
  TEST = 'TEST',
  /** Replace the stored credentials. */
  REPLACE = 'REPLACE',
  /** Disconnect the connection. */
  DISCONNECT = 'DISCONNECT',
}
