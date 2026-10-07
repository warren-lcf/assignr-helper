/** One field-level problem in a 400 `VALIDATION_ERROR` response. */
export interface IApiViolation {
  /** Request body field the problem is about, e.g. `client_id`. */
  path: string;
  /** Human-readable problem. */
  message: string;
}
