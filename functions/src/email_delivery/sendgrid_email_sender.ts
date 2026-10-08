import { classify_send_failure } from './classify_send_failure.js';
import { EmailDeliveryError } from './errors/email_delivery.error.js';
import { IEmailCredentials } from './models/email_credentials.model.js';
import { IEmailSendReceipt } from './models/email_send_receipt.model.js';
import { IOutboundEmail } from './models/outbound_email.model.js';
import { IEmailSender } from './ports/email_sender.interface.js';

/** The part of core-server's `send_email` this adapter uses. */
export type SendEmailFunction = (options: {
  credentials: IEmailCredentials;
  to_email: string;
  subject: string;
  body: string;
  html: string;
  from_name?: string;
  reply_to?: string;
}) => Promise<{ provider_message_id: string | null }>;

/**
 * Loads core-server's `send_email` on first use. Its module (`.../core-server/messaging`) also
 * pulls in the Twilio and text-to-speech SDKs, so it is imported lazily: an instance that never
 * sends email, and every spec, never loads them.
 * @returns The `send_email` function.
 */
async function load_core_send_email(): Promise<SendEmailFunction> {
  const messaging = await import('@hch-shared-libraries/core-server/messaging');
  return messaging.send_email;
}

/**
 * Delivers email through a tenant's own SendGrid account using core-server's `send_email`, which
 * builds a fresh SendGrid client per call (so two tenants' keys can never mix) and throws errors
 * that hold only masked addresses. This adapter reduces any failure to a safe code and drops the
 * vendor's text entirely.
 *
 * Known gap: `send_email` cannot set custom headers, so `List-Unsubscribe` and
 * `List-Unsubscribe-Post` (one-click unsubscribe) are not sent; the unsubscribe link lives in the
 * message body only.
 */
export class SendGridEmailSender implements IEmailSender {
  private core_send_email: Promise<SendEmailFunction> | null = null;

  /**
   * Creates the sender.
   * @param load_send_email Provides `send_email`; specs pass a fake so no network is touched.
   */
  public constructor(
    private readonly load_send_email: () => Promise<SendEmailFunction> = load_core_send_email,
  ) {}

  /** @inheritdoc */
  public async send(
    credentials: IEmailCredentials,
    message: IOutboundEmail,
  ): Promise<IEmailSendReceipt> {
    let result: { provider_message_id: string | null };
    try {
      this.core_send_email ??= this.load_send_email();
      const send_email = await this.core_send_email;
      result = await send_email({
        credentials: { api_key: credentials.api_key, from_email: credentials.from_email },
        to_email: message.to_email,
        subject: message.subject,
        body: message.text,
        html: message.html,
        ...(message.from_name === null ? {} : { from_name: message.from_name }),
        ...(message.reply_to === null ? {} : { reply_to: message.reply_to }),
      });
    } catch (error) {
      this.core_send_email = null;
      throw new EmailDeliveryError(classify_send_failure(error));
    }
    return { provider_message_id: result.provider_message_id };
  }
}
