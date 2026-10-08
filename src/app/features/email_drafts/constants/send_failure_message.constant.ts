import { SendFailureCode } from '../enums/send_failure_code.enum';

/** English reason for each known per-recipient failure code; translated where shown. */
export const SEND_FAILURE_MESSAGE: Readonly<Record<SendFailureCode, string>> = {
  [SendFailureCode.INVALID_RECIPIENT]: 'The address was not accepted.',
  [SendFailureCode.PROVIDER_REJECTED]: 'The email service refused this message.',
  [SendFailureCode.PROVIDER_UNAVAILABLE]: 'The email service could not be reached.',
  [SendFailureCode.RATE_LIMITED]: 'The email service asked us to slow down.',
};

/** The reason shown for a failure code that is not known. */
export const SEND_FAILURE_FALLBACK_MESSAGE = 'The message could not be delivered.';
