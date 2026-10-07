/**
 * Every successful API response wraps its payload as `{ data }`.
 * @template T Shape of the payload.
 */
export interface IApiEnvelope<T> {
  /** The response payload. */
  data: T;
}
