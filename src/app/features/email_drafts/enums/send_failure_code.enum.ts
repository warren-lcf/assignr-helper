/** Failure codes the send results are known to carry for one recipient. Others fall back to a generic message. */
export enum SendFailureCode {
  INVALID_RECIPIENT = 'INVALID_RECIPIENT',
  PROVIDER_REJECTED = 'PROVIDER_REJECTED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
}
