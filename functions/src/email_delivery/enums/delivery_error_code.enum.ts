/**
 * Safe, machine-readable reasons an email could not be delivered. These are the only failure
 * details that are stored or returned: the mail vendor's own text can echo an address, so it is
 * never kept.
 */
export enum DeliveryErrorCode {
  /** The vendor refused this message (for example a malformed or blocked recipient). Retrying cannot help. */
  PROVIDER_REJECTED = 'PROVIDER_REJECTED',
  /** The vendor refused the API key or the sender address. Every message will fail until it is fixed. */
  PROVIDER_AUTH = 'PROVIDER_AUTH',
  /** The vendor asked us to slow down. */
  PROVIDER_RATE_LIMITED = 'PROVIDER_RATE_LIMITED',
  /** The vendor could not be reached or failed. The message may or may not have been delivered. */
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  /** The send ran out of time before this recipient was tried. */
  TIME_BUDGET_EXCEEDED = 'TIME_BUDGET_EXCEEDED',
  /** The contact was deleted after the send began, so there was no address to send to. */
  CONTACT_MISSING = 'CONTACT_MISSING',
  /** Anything else. */
  UNKNOWN = 'UNKNOWN',
}
