import { describe, expect, it } from 'vitest';
import { DeliveryErrorCode } from './enums/delivery_error_code.enum.js';
import { EmailDeliveryError } from './errors/email_delivery.error.js';
import { InMemoryEmailSender } from './in_memory_email_sender.js';
import { IOutboundEmail } from './models/outbound_email.model.js';

const CREDENTIALS = { api_key: 'SG.k', from_email: 'desk@example.com' };
const message = (to_email: string): IOutboundEmail => ({
  to_email,
  subject: 's',
  text: 't',
  html: 'h',
  from_name: null,
  reply_to: null,
});

describe('InMemoryEmailSender', () => {
  it('records accepted emails with sequential message ids', async () => {
    const sender = new InMemoryEmailSender();

    const a = await sender.send(CREDENTIALS, message('a@example.com'));
    const b = await sender.send(CREDENTIALS, message('b@example.com'));

    expect([a.provider_message_id, b.provider_message_id]).toEqual(['msg-1', 'msg-2']);
    expect(sender.sent.map((email) => email.message.to_email)).toEqual([
      'a@example.com',
      'b@example.com',
    ]);
  });

  it('fails the chosen recipient with the chosen code, still counting the attempt', async () => {
    const sender = new InMemoryEmailSender();
    sender.failures.set('bad@example.com', DeliveryErrorCode.PROVIDER_REJECTED);

    const failure = await sender
      .send(CREDENTIALS, message('BAD@example.com'))
      .catch((e: unknown) => e);

    expect((failure as EmailDeliveryError).error_code).toBe(DeliveryErrorCode.PROVIDER_REJECTED);
    expect(sender.sent).toEqual([]);
    expect(sender.attempts).toHaveLength(1);
  });

  it('can hold a send open until released', async () => {
    const sender = new InMemoryEmailSender();
    let release: () => void = () => undefined;
    sender.before_send = () => new Promise<void>((resolve) => (release = resolve));

    const pending = sender.send(CREDENTIALS, message('a@example.com'));
    await Promise.resolve();
    expect(sender.sent).toHaveLength(0);
    release();
    await pending;

    expect(sender.sent).toHaveLength(1);
  });
});
