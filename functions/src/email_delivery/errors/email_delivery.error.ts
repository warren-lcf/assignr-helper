import { DeliveryErrorCode } from '../enums/delivery_error_code.enum.js';

/**
 * An email could not be delivered. The message is fixed text and the only detail is a safe code:
 * the vendor's response, which can contain the recipient's address or the request body, is
 * deliberately not carried, so this error is always safe to log.
 */
export class EmailDeliveryError extends Error {
  public constructor(public readonly error_code: DeliveryErrorCode) {
    super(`The email could not be delivered (${error_code})`);
    this.name = 'EmailDeliveryError';
  }
}
