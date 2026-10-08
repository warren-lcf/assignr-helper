import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryErrorCode } from '../email_delivery/enums/delivery_error_code.enum.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { IRoutesApp, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { DeliveryStatus } from './enums/delivery_status.enum.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import { DraftLockedError } from './errors/draft_locked.error.js';
import { EmailDraftNotFoundError } from './errors/email_draft_not_found.error.js';
import { EmailNotConfiguredError } from './errors/email_not_configured.error.js';
import { NoGamesError } from './errors/no_games.error.js';
import { NoRecipientsError } from './errors/no_recipients.error.js';
import { RecipientCountChangedError } from './errors/recipient_count_changed.error.js';
import { TooManyRecipientsError } from './errors/too_many_recipients.error.js';
import { seed_contact, seed_email_scenario } from './seed_email_scenario.fixture.js';
import { make_contract_draft } from './stores/contracts/make_contract_draft.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-owner-a',
  actual_role: 'TENANT_OWNER',
  effective_role: 'TENANT_OWNER',
};

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

/**
 * Builds the usual scenario with a stored draft-1.
 * @returns The routes app, whose stores and services the spec drives directly.
 */
async function make_scenario(): Promise<IRoutesApp> {
  const context = make_routes_app();
  await seed_email_scenario(context);
  await context.email_drafts.create_draft(make_contract_draft('t1', 'draft-1'));
  return context;
}

describe('EmailSendService errors raised before anything changes', () => {
  it('throws EmailNotConfiguredError without settings', async () => {
    const context = await make_scenario();
    await context.email_settings.delete('t1');

    await expect(
      context.make_email_send_service().send(ACTOR, 'draft-1', 3),
    ).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('throws EmailDraftNotFoundError for an unknown draft', async () => {
    const context = await make_scenario();

    await expect(context.make_email_send_service().send(ACTOR, 'nope', 3)).rejects.toBeInstanceOf(
      EmailDraftNotFoundError,
    );
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('throws NoRecipientsError, TooManyRecipientsError, RecipientCountChangedError and NoGamesError', async () => {
    const context = await make_scenario();
    const service = context.make_email_send_service();

    await expect(service.send(ACTOR, 'draft-1', 2)).rejects.toBeInstanceOf(
      RecipientCountChangedError,
    );
    await expect(service.send(ACTOR, 'draft-1', 2)).rejects.toMatchObject({
      current: 3,
      confirmed: 2,
    });

    for (let i = 0; i < 98; i++) await seed_contact(context, `x${i}`, `X ${i}`);
    await expect(service.send(ACTOR, 'draft-1', 101)).rejects.toMatchObject({
      eligible: 101,
      limit: 100,
    });
    await expect(service.send(ACTOR, 'draft-1', 101)).rejects.toBeInstanceOf(
      TooManyRecipientsError,
    );

    const empty = make_routes_app();
    await seed_email_scenario(empty);
    await empty.email_drafts.create_draft(make_contract_draft('t1', 'draft-1'));
    for (const id of ['c-ann', 'c-bob', 'c-cyd']) {
      await empty.contacts.mark_unsubscribed('t1', id, 5, 'x');
    }
    await expect(empty.make_email_send_service().send(ACTOR, 'draft-1', 0)).rejects.toBeInstanceOf(
      NoRecipientsError,
    );

    const no_games = make_routes_app();
    await seed_email_scenario(no_games);
    await no_games.email_drafts.create_draft(
      make_contract_draft('t1', 'draft-1', {
        filters: { ...make_contract_draft('t1', 'x').filters, level: 'U99' },
      }),
    );
    await expect(
      no_games.make_email_send_service().send(ACTOR, 'draft-1', 3),
    ).rejects.toBeInstanceOf(NoGamesError);
  });

  it('throws DraftLockedError for a draft that is already SENT', async () => {
    const context = await make_scenario();
    const service = context.make_email_send_service();
    await service.send(ACTOR, 'draft-1', 3);

    await expect(service.send(ACTOR, 'draft-1', 3)).rejects.toBeInstanceOf(DraftLockedError);
  });
});

describe('EmailSendService delivery', () => {
  it('never has more than five emails in flight', async () => {
    const context = await make_scenario();
    for (let i = 0; i < 20; i++) await seed_contact(context, `x${i}`, `X ${i}`);
    let in_flight = 0;
    let peak = 0;
    context.email_sender.before_send = async () => {
      in_flight += 1;
      peak = Math.max(peak, in_flight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      in_flight -= 1;
    };

    const result = await context.make_email_send_service().send(ACTOR, 'draft-1', 23);

    expect(result.sent).toBe(23);
    expect(peak).toBe(5);
  });

  it('honours a lower concurrency', async () => {
    const context = await make_scenario();
    let in_flight = 0;
    let peak = 0;
    context.email_sender.before_send = async () => {
      in_flight += 1;
      peak = Math.max(peak, in_flight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      in_flight -= 1;
    };

    await context.make_email_send_service({ concurrency: 2 }).send(ACTOR, 'draft-1', 3);

    expect(peak).toBe(2);
  });

  it('stops delivering when the vendor refuses the key, without trying the rest', async () => {
    const context = await make_scenario();
    context.email_sender.failures.set('c-ann@people.example.com', DeliveryErrorCode.PROVIDER_AUTH);

    const result = await context
      .make_email_send_service({ concurrency: 1 })
      .send(ACTOR, 'draft-1', 3);

    expect(result.status).toBe('PARTIALLY_SENT');
    expect(result.results.map((r) => [r.contact_id, r.status, r.error_code])).toEqual([
      ['c-ann', 'FAILED', 'PROVIDER_AUTH'],
      ['c-bob', 'FAILED', 'PROVIDER_AUTH'],
      ['c-cyd', 'FAILED', 'PROVIDER_AUTH'],
    ]);
    expect(context.email_sender.attempts).toHaveLength(1);
    const recipients = await context.email_deliveries.list_recipients('t1', 'draft-1');
    expect(recipients.every((r) => r.status === DeliveryStatus.FAILED)).toBe(true);
  });

  it('stops delivering when the time budget runs out and leaves the rest for a retry', async () => {
    const context = await make_scenario();
    let time = 1_800_000_000_000;
    context.email_sender.before_send = async () => {
      time += 100_000;
    };
    const service = context.make_email_send_service({
      concurrency: 1,
      time_budget_ms: 150_000,
      now: () => time,
    });

    const result = await service.send(ACTOR, 'draft-1', 3);

    expect(result.results.map((r) => [r.contact_id, r.status, r.error_code])).toEqual([
      ['c-ann', 'SENT', null],
      ['c-bob', 'SENT', null],
      ['c-cyd', 'FAILED', 'TIME_BUDGET_EXCEEDED'],
    ]);
    expect(result.status).toBe('PARTIALLY_SENT');
    expect(context.email_sender.attempts).toHaveLength(2);

    context.email_sender.before_send = null;
    const retry = await context.make_email_send_service().send(ACTOR, 'draft-1', 3);
    expect(retry.status).toBe('SENT');
    expect(retry.sent).toBe(1);
  });

  it('reports a contact deleted mid-send as failed without an address to send to', async () => {
    const context = await make_scenario();
    context.email_sender.before_send = async (message) => {
      if (message.to_email === 'c-ann@people.example.com') {
        await context.contacts.delete_contact('t1', 'c-cyd', 9, 'x');
      }
    };

    const result = await context
      .make_email_send_service({ concurrency: 1 })
      .send(ACTOR, 'draft-1', 3);

    expect(result.results.find((r) => r.contact_id === 'c-cyd')).toEqual({
      contact_id: 'c-cyd',
      status: 'FAILED',
      error_code: 'CONTACT_MISSING',
    });
    expect(result.status).toBe('PARTIALLY_SENT');
  });

  it('turns an unexpected error for one recipient into a safe failure and carries on', async () => {
    const context = await make_scenario();
    context.email_sender.before_send = async (message) => {
      if (message.to_email === 'c-bob@people.example.com') {
        throw new Error('boom with c-bob@people.example.com inside');
      }
    };

    const result = await context
      .make_email_send_service({ concurrency: 1 })
      .send(ACTOR, 'draft-1', 3);

    expect(result.results.map((r) => r.status)).toEqual(['SENT', 'FAILED', 'SENT']);
    expect(result.results[1].error_code).toBe('UNKNOWN');
    expect(JSON.stringify(result)).not.toContain('people.example.com');
    expect(JSON.stringify(log.mock.calls)).not.toContain('people.example.com');
  });

  it('still reports a delivered email as SENT when recording it fails, and logs without the address', async () => {
    const context = await make_scenario();
    vi.spyOn(context.email_deliveries, 'record_result').mockRejectedValue(new Error('store down'));

    const result = await context.make_email_send_service().send(ACTOR, 'draft-1', 3);

    expect(result.sent).toBe(3);
    expect(JSON.stringify(log.mock.calls)).not.toContain('people.example.com');
  });

  it('answers with its results even when closing the draft fails afterwards', async () => {
    const context = await make_scenario();
    vi.spyOn(context.email_drafts, 'finish_send').mockRejectedValue(new Error('store down'));

    const result = await context.make_email_send_service().send(ACTOR, 'draft-1', 3);

    expect(result.status).toBe('SENT');
    expect(context.audit.rows.at(-1)).toMatchObject({
      resource_type: 'email_draft',
      action: 'UPDATE',
    });
  });

  it('answers with its results even when the audit write fails afterwards', async () => {
    const context = await make_scenario();
    const original = context.audit.append_audit_log.bind(context.audit);
    vi.spyOn(context.audit, 'append_audit_log').mockImplementation(async (entry) => {
      if (entry.resource_type === 'email_draft') throw new Error('audit down');
      return original(entry);
    });

    const result = await context.make_email_send_service().send(ACTOR, 'draft-1', 3);

    expect(result.sent).toBe(3);
  });
});

describe('EmailSendService lock and recovery', () => {
  it('puts the draft back and sends nothing when the quick link cannot be made', async () => {
    const context = await make_scenario();
    vi.spyOn(context.quick_links, 'create_link').mockRejectedValueOnce(new Error('store down'));

    await expect(context.make_email_send_service().send(ACTOR, 'draft-1', 3)).rejects.toThrow(
      'store down',
    );

    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.status).toBe(DraftStatus.DRAFT);
    expect(context.email_sender.attempts).toEqual([]);
    const retry = await context.make_email_send_service().send(ACTOR, 'draft-1', 3);
    expect(retry.status).toBe('SENT');
  });

  it('revokes the quick link it made when the send is abandoned before anything is delivered', async () => {
    const context = await make_scenario();
    vi.spyOn(context.email_drafts, 'replace_draft_games').mockRejectedValueOnce(
      new Error('store down'),
    );

    await expect(context.make_email_send_service().send(ACTOR, 'draft-1', 3)).rejects.toThrow(
      'store down',
    );

    const [link] = await context.quick_links.list_links('t1');
    expect(link.revoked_at).not.toBeNull();
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.status).toBe(DraftStatus.DRAFT);
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('still reports the original error when revoking the unused link fails too', async () => {
    const context = await make_scenario();
    vi.spyOn(context.email_drafts, 'replace_draft_games').mockRejectedValueOnce(
      new Error('first problem'),
    );
    vi.spyOn(context.quick_links, 'revoke_link').mockRejectedValue(new Error('second problem'));

    await expect(context.make_email_send_service().send(ACTOR, 'draft-1', 3)).rejects.toThrow(
      'first problem',
    );
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.status).toBe(DraftStatus.DRAFT);
  });

  it('puts a partly sent draft back as PARTIALLY_SENT, not DRAFT, when a retry is abandoned', async () => {
    const context = await make_scenario();
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await context.make_email_send_service().send(ACTOR, 'draft-1', 3);
    vi.spyOn(context.email_drafts, 'replace_draft_games').mockRejectedValueOnce(
      new Error('store down'),
    );

    await expect(context.make_email_send_service().send(ACTOR, 'draft-1', 3)).rejects.toThrow(
      'store down',
    );

    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.status).toBe(
      DraftStatus.PARTIALLY_SENT,
    );
  });

  it('still reports the original error when unlocking the draft fails too', async () => {
    const context = await make_scenario();
    vi.spyOn(context.quick_links, 'create_link').mockRejectedValue(new Error('first problem'));
    vi.spyOn(context.email_drafts, 'revert_send').mockRejectedValue(new Error('second problem'));

    await expect(context.make_email_send_service().send(ACTOR, 'draft-1', 3)).rejects.toThrow(
      'first problem',
    );
  });

  it('takes over a send whose sender died, and does not email recipients it already reached', async () => {
    const context = await make_scenario();
    // A sender locked the draft, delivered to Ann, then died.
    const locked_at = context.harness.clock();
    await context.email_drafts.begin_send('t1', 'draft-1', locked_at, 'dead', 600_000);
    await context.email_deliveries.record_result({
      tenant_id: 't1',
      draft_id: 'draft-1',
      contact_id: 'c-ann',
      status: DeliveryStatus.SENT,
      provider_message_id: 'msg-old',
      error_code: null,
      sent_at: locked_at,
      created_at: locked_at,
      created_by: 'dead',
      updated_at: locked_at,
      updated_by: 'dead',
    });

    const too_soon = context.make_email_send_service({ now: () => locked_at + 599_999 });
    await expect(too_soon.send(ACTOR, 'draft-1', 3)).rejects.toBeInstanceOf(DraftLockedError);

    const takeover = context.make_email_send_service({ now: () => locked_at + 600_000 });
    const result = await takeover.send(ACTOR, 'draft-1', 3);

    expect(result.results.map((r) => [r.contact_id, r.status])).toEqual([
      ['c-ann', 'ALREADY_SENT'],
      ['c-bob', 'SENT'],
      ['c-cyd', 'SENT'],
    ]);
    expect(result.status).toBe('SENT');
    expect(context.email_sender.attempts.map((m) => m.to_email)).not.toContain(
      'c-ann@people.example.com',
    );
  });
});
