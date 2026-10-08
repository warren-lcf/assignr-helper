import { IEmailCredentials } from '../models/email_credentials.model.js';
import { IEmailSendReceipt } from '../models/email_send_receipt.model.js';
import { IOutboundEmail } from '../models/outbound_email.model.js';

/** Port to the service that actually delivers email. Specs use a recording double. */
export interface IEmailSender {
  /**
   * Sends one email through the tenant's own account.
   * @param credentials The tenant's API key and sender address.
   * @param message The finished email.
   * @returns The vendor's receipt.
   * @throws EmailDeliveryError carrying a safe code when the vendor does not accept the message.
   */
  send(credentials: IEmailCredentials, message: IOutboundEmail): Promise<IEmailSendReceipt>;
}
