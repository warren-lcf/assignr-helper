import {
  SEND_FAILURE_FALLBACK_MESSAGE,
  SEND_FAILURE_MESSAGE,
} from '../constants/send_failure_message.constant';
import { SendFailureCode } from '../enums/send_failure_code.enum';

/**
 * The reason to show for one recipient's failure. Only known codes are
 * mapped; anything else gets a generic reason, and the raw code is never shown.
 * @param error_code The code the send result carried, or null.
 * @param translate Translates an English key.
 * @returns The translated reason.
 */
export function format_send_failure(
  error_code: string | null,
  translate: (key: string) => string,
): string {
  const known = Object.values<string>(SendFailureCode).includes(error_code ?? '');
  return translate(
    known ? SEND_FAILURE_MESSAGE[error_code as SendFailureCode] : SEND_FAILURE_FALLBACK_MESSAGE,
  );
}
