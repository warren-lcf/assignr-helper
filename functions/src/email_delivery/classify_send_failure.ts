import { DeliveryErrorCode } from './enums/delivery_error_code.enum.js';

/**
 * Reduces whatever a mail send threw to a safe code. Only the numeric HTTP status is read; the
 * error's message and any vendor text are ignored, because they can contain addresses.
 * @param error The thrown value (core-server's `SendEmailError` carries `status_code`).
 * @returns The code to store and show.
 */
export function classify_send_failure(error: unknown): DeliveryErrorCode {
  const status = (error as { status_code?: unknown } | null)?.status_code;
  if (status === null) {
    return DeliveryErrorCode.PROVIDER_UNAVAILABLE;
  }
  if (typeof status !== 'number') {
    return DeliveryErrorCode.UNKNOWN;
  }
  if (status === 401 || status === 403) {
    return DeliveryErrorCode.PROVIDER_AUTH;
  }
  if (status === 429) {
    return DeliveryErrorCode.PROVIDER_RATE_LIMITED;
  }
  if (status >= 500) {
    return DeliveryErrorCode.PROVIDER_UNAVAILABLE;
  }
  if (status >= 400) {
    return DeliveryErrorCode.PROVIDER_REJECTED;
  }
  return DeliveryErrorCode.UNKNOWN;
}
