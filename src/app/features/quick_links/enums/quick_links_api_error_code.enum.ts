/** Machine-readable reasons the quick link endpoints refuse a request. Mirrors the backend. */
export enum QuickLinksApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  TENANT_REQUIRED = 'TENANT_REQUIRED',
  PERMISSION_REQUIRED = 'PERMISSION_REQUIRED',
  RATE_LIMITED = 'RATE_LIMITED',
}
