import { SendResultStatus } from '../enums/send_result_status.enum.js';

/** What a send did for one contact. It holds the contact id, never the address. */
export interface ISendResultRow {
  contact_id: string;
  status: SendResultStatus;
  /** Safe machine code of the failure (see `DeliveryErrorCode`); null unless the status is FAILED. */
  error_code: string | null;
}
