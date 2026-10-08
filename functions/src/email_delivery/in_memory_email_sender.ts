import { DeliveryErrorCode } from './enums/delivery_error_code.enum.js';
import { EmailDeliveryError } from './errors/email_delivery.error.js';
import { IEmailCredentials } from './models/email_credentials.model.js';
import { IEmailSendReceipt } from './models/email_send_receipt.model.js';
import { IOutboundEmail } from './models/outbound_email.model.js';
import { IEmailSender } from './ports/email_sender.interface.js';

/** One email the recording sender accepted. */
export interface ISentEmail {
  credentials: IEmailCredentials;
  message: IOutboundEmail;
  provider_message_id: string;
}

/**
 * An {@link IEmailSender} that delivers nothing and records everything: the double for specs and
 * for running the app locally without a mail account. A spec makes chosen recipients fail by
 * address, or holds every send until it releases it, to exercise concurrency.
 */
export class InMemoryEmailSender implements IEmailSender {
  /** Emails accepted so far, in order. */
  public readonly sent: ISentEmail[] = [];

  /** Every send attempt, accepted or not, in order. */
  public readonly attempts: IOutboundEmail[] = [];

  /** Recipients (lower-case address) that fail, with the code they fail with. */
  public readonly failures = new Map<string, DeliveryErrorCode>();

  /** Called at the start of every send; a spec can make it wait to hold sends open. */
  public before_send: ((message: IOutboundEmail) => Promise<void>) | null = null;

  private counter = 0;

  /** @inheritdoc */
  public async send(
    credentials: IEmailCredentials,
    message: IOutboundEmail,
  ): Promise<IEmailSendReceipt> {
    this.attempts.push(message);
    if (this.before_send) {
      await this.before_send(message);
    }
    const failure = this.failures.get(message.to_email.toLowerCase());
    if (failure !== undefined) {
      throw new EmailDeliveryError(failure);
    }
    this.counter += 1;
    const provider_message_id = `msg-${this.counter}`;
    this.sent.push({ credentials, message, provider_message_id });
    return { provider_message_id };
  }
}
