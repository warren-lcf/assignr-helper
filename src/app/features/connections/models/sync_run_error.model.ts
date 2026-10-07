/** The error a failed sync run recorded. */
export interface ISyncRunError {
  /** Error class name. */
  name: string;
  /** Error message. */
  message: string;
  /** HTTP status of the provider's reply, when there was one. */
  status: number | null;
}
