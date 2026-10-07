/** One problem found in a request, addressed to the field that caused it. */
export interface IViolation {
  /** Dotted path to the offending field, e.g. `limit`; empty for the whole value. */
  path: string;
  message: string;
}
