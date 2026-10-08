import { SendResultStatus } from '../enums/send_result_status.enum';

/** What happened to one recipient. */
export interface ISendRecipientResult {
  contact_id: string;
  status: SendResultStatus;
  /** A short machine code for a failure, or null. */
  error_code: string | null;
}
