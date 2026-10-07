/** Failure recorded on a sync run; contains no tokens or request bodies. */
export interface ISyncRunError {
  name: string;
  message: string;
  /** HTTP status when the failure came from the provider API. */
  status: number | null;
}
