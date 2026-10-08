import { describe, expect, it, vi } from 'vitest';
import { DeliveryErrorCode } from './enums/delivery_error_code.enum.js';
import { EmailDeliveryError } from './errors/email_delivery.error.js';
import { IOutboundEmail } from './models/outbound_email.model.js';
import { SendEmailFunction, SendGridEmailSender } from './sendgrid_email_sender.js';

const CREDENTIALS = { api_key: 'SG.the-key', from_email: 'desk@example.com' };
const MESSAGE: IOutboundEmail = {
  to_email: 'sam@example.com',
  subject: 'Games',
  text: 'plain',
  html: '<p>html</p>',
  from_name: 'Desk',
  reply_to: 'reply@example.com',
};

describe('SendGridEmailSender', () => {
  it('hands the message and the tenant credentials to core-server send_email and returns the receipt', async () => {
    const send_email = vi.fn<SendEmailFunction>(async () => ({ provider_message_id: 'sg-1' }));
    const sender = new SendGridEmailSender(async () => send_email);

    const receipt = await sender.send(CREDENTIALS, MESSAGE);

    expect(receipt).toEqual({ provider_message_id: 'sg-1' });
    expect(send_email).toHaveBeenCalledWith({
      credentials: CREDENTIALS,
      to_email: 'sam@example.com',
      subject: 'Games',
      body: 'plain',
      html: '<p>html</p>',
      from_name: 'Desk',
      reply_to: 'reply@example.com',
    });
  });

  it('omits the sender name and reply-to when there are none', async () => {
    const send_email = vi.fn<SendEmailFunction>(async () => ({ provider_message_id: null }));

    await new SendGridEmailSender(async () => send_email).send(CREDENTIALS, {
      ...MESSAGE,
      from_name: null,
      reply_to: null,
    });

    const [options] = send_email.mock.calls[0];
    expect(Object.keys(options)).not.toContain('from_name');
    expect(Object.keys(options)).not.toContain('reply_to');
  });

  it('loads send_email once and reuses it', async () => {
    const send_email = vi.fn<SendEmailFunction>(async () => ({ provider_message_id: 'x' }));
    const load = vi.fn(async () => send_email);
    const sender = new SendGridEmailSender(load);

    await sender.send(CREDENTIALS, MESSAGE);
    await sender.send(CREDENTIALS, MESSAGE);

    expect(load).toHaveBeenCalledTimes(1);
    expect(send_email).toHaveBeenCalledTimes(2);
  });

  it('turns a vendor failure into a safe code and drops the vendor text', async () => {
    const send_email = vi.fn<SendEmailFunction>(async () => {
      throw Object.assign(new Error('rejected s***@e***.com with the key SG.the-key'), {
        status_code: 403,
        provider_messages: ['The from address does not match a verified Sender Identity'],
      });
    });
    const sender = new SendGridEmailSender(async () => send_email);

    const failure = (await sender.send(CREDENTIALS, MESSAGE).catch((e: unknown) => e)) as Error;

    expect(failure).toBeInstanceOf(EmailDeliveryError);
    expect((failure as EmailDeliveryError).error_code).toBe(DeliveryErrorCode.PROVIDER_AUTH);
    expect(failure.message).not.toContain('SG.the-key');
    expect(failure.message).not.toContain('Sender Identity');
    expect(failure.cause).toBeUndefined();
  });

  it('reports a module that cannot be loaded as an unknown failure, and tries again next time', async () => {
    const send_email = vi.fn<SendEmailFunction>(async () => ({ provider_message_id: 'ok' }));
    const load = vi
      .fn<() => Promise<SendEmailFunction>>()
      .mockRejectedValueOnce(new Error('cannot find module twilio'))
      .mockResolvedValue(send_email);
    const sender = new SendGridEmailSender(load);

    const first = (await sender.send(CREDENTIALS, MESSAGE).catch((e: unknown) => e)) as Error;
    const second = await sender.send(CREDENTIALS, MESSAGE);

    expect((first as EmailDeliveryError).error_code).toBe(DeliveryErrorCode.UNKNOWN);
    expect(second.provider_message_id).toBe('ok');
  });

  it('is wired to core-server by default: the real module loads and exports send_email (nothing is sent)', async () => {
    const real = await import('@hch-shared-libraries/core-server/messaging');

    expect(typeof real.send_email).toBe('function');
    expect(new SendGridEmailSender()).toBeInstanceOf(SendGridEmailSender);
  });
});
