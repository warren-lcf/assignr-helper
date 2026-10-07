/** Why a connection test did not succeed. */
export enum ConnectionTestFailure {
  /** No credentials are stored for the connection. */
  NO_CREDENTIALS = 'NO_CREDENTIALS',
  /** The provider rejected the stored credentials. */
  REJECTED = 'REJECTED',
  /** The provider could not be reached; try again. */
  UNREACHABLE = 'UNREACHABLE',
}
