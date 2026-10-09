/** What the save indicator tells the referee. */
export enum SaveState {
  /** Nothing is waiting; the server has everything. */
  SAVED = 'SAVED',
  /** Edits are on their way to the server. */
  SAVING = 'SAVING',
  /** The device has no connection; edits are kept and will be sent when it returns. */
  OFFLINE = 'OFFLINE',
  /** The device looks online but the server could not be reached; the app will try again. */
  RETRYING = 'RETRYING',
}
