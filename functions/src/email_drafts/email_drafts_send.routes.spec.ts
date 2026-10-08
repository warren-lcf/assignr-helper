import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { DeliveryErrorCode } from '../email_delivery/enums/delivery_error_code.enum.js';
import {
  IRoutesApp,
  ROUTES_APP_ORIGIN,
  ROUTE_TOKENS,
  make_routes_app,
} from '../sync/make_routes_app.fixture.js';
import { DeliveryStatus } from './enums/delivery_status.enum.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import {
  SCENARIO_SETTINGS,
  configure_email,
  draft_body,
  seed_contact,
  seed_email_scenario,
  seed_open_game,
} from './seed_email_scenario.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const DAY = 86_400_000;

/**
 * Creates a draft as the tenant-A owner.
 * @param context The routes app under test.
 * @param overrides Body fields to replace.
 * @returns Resolves when created.
 */
async function create_draft(context: IRoutesApp, overrides: Record<string, unknown> = {}) {
  const response = await request(context.app)
    .post('/api/email_drafts')
    .set(auth(ROUTE_TOKENS.owner_a))
    .send(draft_body(overrides));
  expect(response.status).toBe(201);
}

/**
 * Sends draft-1 as the tenant-A owner.
 * @param context The routes app under test.
 * @param confirm_recipient_count The count to confirm.
 * @param token Bearer token.
 * @returns The supertest request.
 */
function send(
  context: IRoutesApp,
  confirm_recipient_count: unknown,
  token: string = ROUTE_TOKENS.owner_a,
) {
  return request(context.app)
    .post('/api/email_drafts/draft-1/send')
    .set(auth(token))
    .send({ confirm_recipient_count });
}

/**
 * Finds the unsubscribe token in an email body.
 * @param html The email's HTML.
 * @returns The token.
 */
function unsubscribe_token_in(html: string): string {
  const match = /\/unsubscribe\/([A-Za-z0-9_-]+)"/.exec(html);
  if (!match) throw new Error('no unsubscribe link in the email');
  return match[1];
}

/**
 * Finds the quick link token in an email body.
 * @param html The email's HTML.
 * @returns The token, or null when the email has no quick link.
 */
function quick_link_token_in(html: string): string | null {
  return /\/q\/([A-Za-z0-9_-]+)"/.exec(html)?.[1] ?? null;
}

/**
 * Asserts nothing about the draft changed: it is a DRAFT with no sends, links or games.
 * @param context The routes app under test.
 * @returns Resolves when the assertions pass.
 */
async function expect_untouched(context: IRoutesApp): Promise<void> {
  const draft = await context.email_drafts.get_draft('t1', 'draft-1');
  expect(draft?.status).toBe(DraftStatus.DRAFT);
  expect(draft?.quick_link_id).toBeNull();
  expect(await context.quick_links.list_links('t1')).toEqual([]);
  expect(await context.email_deliveries.list_recipients('t1', 'draft-1')).toEqual([]);
  expect(context.email_sender.attempts).toEqual([]);
}

let log: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

describe('POST /api/email_drafts/:draft_id/send refusals', () => {
  it('answers 422 EMAIL_NOT_CONFIGURED before anything else and changes nothing', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await context.email_settings.delete('t1');

    const response = await send(context, 999);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EMAIL_NOT_CONFIGURED');
    await expect_untouched(context);
  });

  it('answers 400 NO_RECIPIENTS when nobody can be emailed', async () => {
    const context = make_routes_app();
    await configure_email(context);
    await seed_open_game(context, 'g1');
    await seed_contact(context, 'c-gone', 'Gone', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: 5,
    });
    await create_draft(context);

    const response = await send(context, 0);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NO_RECIPIENTS');
    await expect_untouched(context);
  });

  it('answers 400 NO_RECIPIENTS for SELECTED with nobody chosen', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { recipient_mode: 'SELECTED', contact_ids: [] });

    const response = await send(context, 0);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NO_RECIPIENTS');
  });

  it('answers 400 TOO_MANY_RECIPIENTS above 100 and sends nothing', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    for (let i = 0; i < 98; i++) {
      await seed_contact(context, `extra-${i}`, `Extra ${i}`);
    }
    await create_draft(context);

    const response = await send(context, 101);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TOO_MANY_RECIPIENTS');
    expect(response.body.message).toContain('100');
    await expect_untouched(context);
  });

  it('sends to exactly 100 recipients', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    for (let i = 0; i < 97; i++) {
      await seed_contact(context, `extra-${i}`, `Extra ${i}`);
    }
    await create_draft(context);

    const response = await send(context, 100);

    expect(response.status).toBe(200);
    expect(response.body.data.sent).toBe(100);
    expect(context.email_sender.sent).toHaveLength(100);
  });

  it('answers 409 RECIPIENT_COUNT_CHANGED with the current count when the confirmed count is wrong', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await send(context, 5);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'RECIPIENT_COUNT_CHANGED',
      violations: [{ path: 'current', message: '3' }],
      current: 3,
    });
    expect(response.body.message).toContain('3');
    await expect_untouched(context);
  });

  it('refuses when a contact unsubscribed after the owner looked at the count', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await context.contacts.mark_unsubscribed('t1', 'c-bob', 5, 'public');

    const response = await send(context, 3);

    expect(response.status).toBe(409);
    expect(response.body.current).toBe(2);
    await expect_untouched(context);
  });

  it('answers 400 NO_GAMES and never sends an empty digest', async () => {
    const context = make_routes_app();
    await configure_email(context);
    await seed_contact(context, 'c-ann', 'Ann');
    await create_draft(context);

    const response = await send(context, 1);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NO_GAMES');
    await expect_untouched(context);
  });

  it('answers 400 NO_GAMES when the filters match no game', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { filters: { level: 'U99' } });

    const response = await send(context, 3);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('NO_GAMES');
    await expect_untouched(context);
  });

  it.each([
    ['a missing count', {}],
    ['a text count', { confirm_recipient_count: '3' }],
    ['a fractional count', { confirm_recipient_count: 2.5 }],
    ['a negative count', { confirm_recipient_count: -1 }],
    ['an unknown field', { confirm_recipient_count: 3, to: 'x@example.com' }],
  ])('answers 400 for %s', async (_label, body) => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await request(context.app)
      .post('/api/email_drafts/draft-1/send')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    await expect_untouched(context);
  });

  it('answers 404 for an unknown draft and for another tenant draft', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ api_key: 'SG.b', from_email: 'b@example.org' });

    const other = await send(context, 3, ROUTE_TOKENS.owner_b);
    const unknown = await request(context.app)
      .post('/api/email_drafts/nope/send')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ confirm_recipient_count: 3 });

    expect(other.status).toBe(404);
    expect(unknown.status).toBe(404);
    await expect_untouched(context);
  });

  it('answers 503 and sends nothing when the unsubscribe signing key is unavailable', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    vi.spyOn(context.unsubscribe_secrets, 'read').mockRejectedValue(new Error('permission denied'));

    const response = await send(context, 3);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe('UNSUBSCRIBE_KEY_UNAVAILABLE');
    await expect_untouched(context);
  });
});

describe('POST /api/email_drafts/:draft_id/send success', () => {
  it('emails every consenting contact and reports a result for each', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await send(context, 3);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      data: {
        status: 'SENT',
        sent: 3,
        failed: 0,
        results: [
          { contact_id: 'c-ann', status: 'SENT', error_code: null },
          { contact_id: 'c-bob', status: 'SENT', error_code: null },
          { contact_id: 'c-cyd', status: 'SENT', error_code: null },
        ],
      },
    });
    expect(context.email_sender.sent.map((s) => s.message.to_email)).toEqual([
      'c-ann@people.example.com',
      'c-bob@people.example.com',
      'c-cyd@people.example.com',
    ]);
  });

  it('sends each email through the tenant account with its sender name, reply-to and a personal greeting', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { intro: 'Please sign up.' });

    await send(context, 3);

    const [first] = context.email_sender.sent;
    expect(first.credentials).toEqual({
      api_key: SCENARIO_SETTINGS.api_key,
      from_email: SCENARIO_SETTINGS.from_email,
    });
    expect(first.message).toMatchObject({
      subject: 'Games this weekend',
      from_name: 'Metro Referee Desk',
      reply_to: 'reply@example.com',
    });
    expect(first.message.html).toContain('Hi Ann,');
    expect(first.message.text).toContain('Hi Ann,');
    expect(first.message.html).toContain('Please sign up.');
    expect(first.message.html).toContain('Hawks vs Eagles');
    expect(first.message.html).toContain('1 Main St, Springfield, VA 22150');
    expect(context.email_sender.sent[1].message.html).toContain('Hi Bob,');
    expect(first.message.html).not.toContain('Hi Bob,');
  });

  it('gives each recipient their own signed unsubscribe link that opens only their contact', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await send(context, 3);

    const tokens = context.email_sender.sent.map((s) => unsubscribe_token_in(s.message.html));
    expect(new Set(tokens).size).toBe(3);
    for (const [index, token] of tokens.entries()) {
      const preview = await context.unsubscribe.describe(token);
      const contact = ['c-ann', 'c-bob', 'c-cyd'][index];
      expect(preview?.email_masked).toBe('c***@p***.com');
      await context.unsubscribe.unsubscribe(token);
      expect((await context.contacts.get_contact('t1', contact))?.consent_status).toBe(
        ConsentStatus.UNSUBSCRIBED,
      );
      for (const other of ['c-ann', 'c-bob', 'c-cyd'].filter((id) => id !== contact)) {
        const state = (await context.contacts.get_contact('t1', other))?.consent_status;
        expect(state === ConsentStatus.UNSUBSCRIBED).toBe(
          ['c-ann', 'c-bob', 'c-cyd'].indexOf(other) < index,
        );
      }
    }
    expect(context.email_sender.sent[0].message.text).toContain(
      `${ROUTES_APP_ORIGIN}/unsubscribe/`,
    );
  });

  it('records the send on the draft and snapshots the games that were emailed', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await send(context, 3);

    const draft = await context.email_drafts.get_draft('t1', 'draft-1');
    expect(draft).toMatchObject({
      status: 'SENT',
      recipient_count: 3,
      sent_at: context.harness.clock(),
      quick_link_id: 'ql-1',
    });
    const games = await context.email_drafts.list_draft_games('t1', 'draft-1');
    expect(games.map((snapshot) => snapshot.game_id)).toEqual(['g1', 'g2']);
    expect(games[0].game).toMatchObject({ home_team: 'Hawks', away_team: 'Eagles' });
    const recipients = await context.email_deliveries.list_recipients('t1', 'draft-1');
    expect(recipients.map((r) => [r.contact_id, r.status, r.provider_message_id])).toEqual([
      ['c-ann', DeliveryStatus.SENT, 'msg-1'],
      ['c-bob', DeliveryStatus.SENT, 'msg-2'],
      ['c-cyd', DeliveryStatus.SENT, 'msg-3'],
    ]);
    expect(recipients.every((r) => r.error_code === null && r.sent_at !== null)).toBe(true);
  });

  it('mints one quick link at send time, scoped from the filters, and puts the same link in every email', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_open_game(context, 'g-org', { organization_id: 'org-7', level: 'U12' });
    await create_draft(context, {
      quick_link_expiry_days: 30,
      filters: {
        level: 'U12',
        organization_id: 'org-7',
        date_from: Date.UTC(2027, 0, 15, 1),
        date_to: Date.UTC(2027, 0, 20, 12),
      },
    });
    expect(await context.quick_links.list_links('t1')).toEqual([]);

    const response = await send(context, 3);

    expect(response.status).toBe(200);
    const links = await context.quick_links.list_links('t1');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      link_id: 'ql-1',
      email_draft_id: 'draft-1',
      expires_at: context.harness.clock() + 30 * DAY,
      revoked_at: null,
      created_by: 'u-owner-a',
      scope: {
        organization_ids: ['org-7'],
        levels: ['U12'],
        date_start: Date.UTC(2027, 0, 15),
        date_end: Date.UTC(2027, 0, 20),
      },
    });
    const tokens = context.email_sender.sent.map((s) => quick_link_token_in(s.message.html));
    expect(new Set(tokens).size).toBe(1);
    expect(tokens[0]).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(links[0].token_hash).toBe(hash_quick_link_token(tokens[0] as string));
  });

  it('never stores, logs or returns the quick link token', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await create_draft(context);

    const response = await send(context, 3);

    const token = quick_link_token_in(context.email_sender.sent[0].message.html) as string;
    expect(token).toBeTruthy();
    const everything = JSON.stringify({
      response: response.body,
      draft: await context.email_drafts.get_draft('t1', 'draft-1'),
      games: await context.email_drafts.list_draft_games('t1', 'draft-1'),
      recipients: await context.email_deliveries.list_recipients('t1', 'draft-1'),
      audit: context.audit.rows,
      logs: log.mock.calls,
    });
    expect(everything).not.toContain(token);
    for (const email of context.email_sender.sent) {
      expect(unsubscribe_token_in(email.message.html)).toBeTruthy();
      expect(everything).not.toContain(unsubscribe_token_in(email.message.html));
    }
  });

  it('puts no quick link in the emails and creates none when the draft has none', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { include_quick_link: false });

    await send(context, 3);

    expect(await context.quick_links.list_links('t1')).toEqual([]);
    expect(
      context.email_sender.sent.every((s) => quick_link_token_in(s.message.html) === null),
    ).toBe(true);
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.quick_link_id).toBeNull();
  });

  it('audits the link creation and the send with counts only', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await send(context, 3);

    const rows = context.audit.rows;
    expect(rows.map((r) => `${r.resource_type}:${r.action}`)).toEqual([
      'email_draft:CREATE',
      'quick_link:CREATE',
      'email_draft:UPDATE',
    ]);
    const send_row = rows[2];
    expect(send_row).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_id: 'draft-1',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.parse(send_row.before_state_json ?? 'null')).toEqual({
      draft_id: 'draft-1',
      status: 'DRAFT',
    });
    expect(JSON.parse(send_row.after_state_json ?? 'null')).toEqual({
      draft_id: 'draft-1',
      status: 'SENT',
      quick_link_id: 'ql-1',
      eligible: 3,
      sent: 3,
      failed: 0,
      skipped_unsubscribed: 0,
      already_sent: 0,
      game_count: 2,
    });
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('people.example.com');
    expect(serialized).not.toContain('Ann');
    expect(serialized).not.toContain(SCENARIO_SETTINGS.api_key);
  });

  it('records the assumed role when a platform administrator sends for a tenant', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await request(context.app)
      .post('/api/email_drafts/draft-1/send')
      .set(auth(ROUTE_TOKENS.admin))
      .set('X-Acting-Tenant-Id', 't1')
      .set('X-Effective-Role', 'TENANT_OWNER')
      .send({ confirm_recipient_count: 3 });

    expect(response.status).toBe(200);
    expect(context.audit.rows.at(-1)).toMatchObject({
      user_id: 'u-admin',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
  });
});

describe('POST /api/email_drafts/:draft_id/send consent', () => {
  it('never emails an unsubscribed contact in ALL_CONSENTED mode', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_contact(context, 'c-dee', 'Dee Day', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: 5,
    });
    await create_draft(context);

    const response = await send(context, 3);

    expect(
      response.body.data.results.map((r: { contact_id: string }) => r.contact_id),
    ).not.toContain('c-dee');
    expect(context.email_sender.attempts.map((m) => m.to_email)).not.toContain(
      'c-dee@people.example.com',
    );
  });

  it('reports a chosen contact who has unsubscribed as skipped and does not email them', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_contact(context, 'c-dee', 'Dee Day', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: 5,
    });
    await create_draft(context, {
      recipient_mode: 'SELECTED',
      contact_ids: ['c-ann', 'c-dee'],
    });

    const response = await send(context, 1);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'SENT', sent: 1, failed: 0 });
    expect(response.body.data.results).toEqual([
      { contact_id: 'c-ann', status: 'SENT', error_code: null },
      { contact_id: 'c-dee', status: 'SKIPPED_UNSUBSCRIBED', error_code: null },
    ]);
    expect(context.email_sender.attempts.map((m) => m.to_email)).toEqual([
      'c-ann@people.example.com',
    ]);
    expect(await context.email_deliveries.list_recipients('t1', 'draft-1')).toHaveLength(1);
  });

  it('skips a contact who unsubscribes while the send is under way', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    // The first email is on its way when Cyd (still waiting in the queue) unsubscribes.
    context.email_sender.before_send = async (message) => {
      if (message.to_email === 'c-ann@people.example.com') {
        await context.contacts.mark_unsubscribed('t1', 'c-cyd', 9, 'public');
      }
    };
    const serial = context.make_email_send_service({ concurrency: 1 });
    const actor = {
      tenant_id: 't1',
      user_id: 'u-owner-a',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    };

    const result = await serial.send(actor, 'draft-1', 3);

    expect(result.results.map((r) => [r.contact_id, r.status])).toEqual([
      ['c-ann', 'SENT'],
      ['c-bob', 'SENT'],
      ['c-cyd', 'SKIPPED_UNSUBSCRIBED'],
    ]);
    expect(context.email_sender.attempts.map((m) => m.to_email)).not.toContain(
      'c-cyd@people.example.com',
    );
    expect(result.status).toBe('SENT');
  });

  it('keeps an unsubscribed contact unsubscribed through the whole flow, whatever the owner does', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await send(context, 3);
    const token = unsubscribe_token_in(context.email_sender.sent[0].message.html);

    const unsubscribed = await request(context.app).post(`/api/public/unsubscribe/${token}`);
    const again = await request(context.app)
      .post('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({
        display_name: 'Ann',
        email_address: 'c-ann@people.example.com',
        consent_attested: true,
      });

    expect(unsubscribed.status).toBe(200);
    expect(again.status).toBe(409);
    expect((await context.contacts.get_contact('t1', 'c-ann'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
  });
});

describe('POST /api/email_drafts/:draft_id/send double sends', () => {
  it('refuses a second send of a sent draft with DRAFT_LOCKED and emails nobody again', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await send(context, 3);

    const second = await send(context, 3);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DRAFT_LOCKED');
    expect(context.email_sender.sent).toHaveLength(3);
    expect(await context.quick_links.list_links('t1')).toHaveLength(1);
  });

  it('lets exactly one of two simultaneous requests send; the other gets DRAFT_LOCKED', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    context.email_sender.before_send = () => held;

    const first = send(context, 3).then((response) => response);
    await vi.waitFor(() => expect(context.email_sender.attempts.length).toBeGreaterThan(0));
    const second = await send(context, 3);
    release();
    const first_response = await first;

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DRAFT_LOCKED');
    expect(first_response.status).toBe(200);
    expect(context.email_sender.sent).toHaveLength(3);
    expect(await context.quick_links.list_links('t1')).toHaveLength(1);
  });

  it('refuses to edit or delete the draft while it is sending', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    context.email_sender.before_send = () => held;

    const sending = send(context, 3).then((response) => response);
    await vi.waitFor(() => expect(context.email_sender.attempts.length).toBeGreaterThan(0));
    const edit = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body({ subject: 'Changed mid-send' }));
    const removal = await request(context.app)
      .delete('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a));
    release();
    await sending;

    expect(edit.status).toBe(409);
    expect(removal.status).toBe(409);
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.subject).toBe(
      'Games this weekend',
    );
  });
});

describe('POST /api/email_drafts/:draft_id/send partial failure and retry', () => {
  it('records a failing recipient with a safe code, finishes the rest and marks the draft PARTIALLY_SENT', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await create_draft(context);

    const response = await send(context, 3);

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'PARTIALLY_SENT', sent: 2, failed: 1 });
    expect(response.body.data.results).toEqual([
      { contact_id: 'c-ann', status: 'SENT', error_code: null },
      { contact_id: 'c-bob', status: 'FAILED', error_code: 'PROVIDER_REJECTED' },
      { contact_id: 'c-cyd', status: 'SENT', error_code: null },
    ]);
    expect(await context.email_drafts.get_draft('t1', 'draft-1')).toMatchObject({
      status: 'PARTIALLY_SENT',
      recipient_count: 2,
    });
    const recipients = await context.email_deliveries.list_recipients('t1', 'draft-1');
    expect(recipients.find((r) => r.contact_id === 'c-bob')).toMatchObject({
      status: DeliveryStatus.FAILED,
      error_code: 'PROVIDER_REJECTED',
      provider_message_id: null,
      sent_at: null,
    });
  });

  it('logs failures with masked addresses only', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await create_draft(context);

    const response = await send(context, 3);

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('c***@p***.com');
    expect(logged).not.toContain('people.example.com');
    expect(logged).not.toContain(SCENARIO_SETTINGS.api_key);
    expect(JSON.stringify(response.body)).not.toContain('people.example.com');
  });

  it('retries only the recipients without a delivered email, reporting the rest as ALREADY_SENT', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_UNAVAILABLE,
    );
    await create_draft(context);
    await send(context, 3);
    context.email_sender.failures.clear();
    const attempts_before = context.email_sender.attempts.length;

    const retry = await send(context, 3);

    expect(retry.status).toBe(200);
    expect(retry.body.data).toEqual({
      status: 'SENT',
      sent: 1,
      failed: 0,
      results: [
        { contact_id: 'c-ann', status: 'ALREADY_SENT', error_code: null },
        { contact_id: 'c-bob', status: 'SENT', error_code: null },
        { contact_id: 'c-cyd', status: 'ALREADY_SENT', error_code: null },
      ],
    });
    expect(context.email_sender.attempts.slice(attempts_before).map((m) => m.to_email)).toEqual([
      'c-bob@people.example.com',
    ]);
    expect(await context.email_drafts.get_draft('t1', 'draft-1')).toMatchObject({
      status: 'SENT',
      recipient_count: 3,
    });
    const recipients = await context.email_deliveries.list_recipients('t1', 'draft-1');
    expect(recipients.every((r) => r.status === DeliveryStatus.SENT)).toBe(true);
  });

  it('stays PARTIALLY_SENT, and can be retried again, while a recipient keeps failing', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await create_draft(context);
    await send(context, 3);

    const retry = await send(context, 3);
    const final = await send(context, 3);

    expect(retry.body.data).toMatchObject({ status: 'PARTIALLY_SENT', sent: 0, failed: 1 });
    expect(final.status).toBe(200);
    expect(context.email_sender.sent).toHaveLength(2);
  });

  it('still refuses to edit or delete a PARTIALLY_SENT draft', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    context.email_sender.failures.set(
      'c-bob@people.example.com',
      DeliveryErrorCode.PROVIDER_REJECTED,
    );
    await create_draft(context);
    await send(context, 3);

    const edit = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body());
    const removal = await request(context.app)
      .delete('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(edit.status).toBe(409);
    expect(removal.status).toBe(409);
  });

  it('reports a total failure as PARTIALLY_SENT with nothing sent', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    for (const id of ['c-ann', 'c-bob', 'c-cyd']) {
      context.email_sender.failures.set(
        `${id}@people.example.com`,
        DeliveryErrorCode.PROVIDER_UNAVAILABLE,
      );
    }
    await create_draft(context);

    const response = await send(context, 3);

    expect(response.body.data).toMatchObject({ status: 'PARTIALLY_SENT', sent: 0, failed: 3 });
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.sent_at).toBeNull();
  });
});

describe('unsubscribing through the link in a sent email', () => {
  it('looks without changing anything, then unsubscribes once, then stays unsubscribed', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await send(context, 3);
    const token = unsubscribe_token_in(context.email_sender.sent[1].message.html);

    const look = await request(context.app).get(`/api/public/unsubscribe/${token}`);
    const still_granted = (await context.contacts.get_contact('t1', 'c-bob'))?.consent_status;
    const unsubscribe = await request(context.app).post(`/api/public/unsubscribe/${token}`);
    const after = await request(context.app).get(`/api/public/unsubscribe/${token}`);
    const repeat = await request(context.app).post(`/api/public/unsubscribe/${token}`);

    expect(look.body).toEqual({
      data: { email_masked: 'c***@p***.com', already_unsubscribed: false },
    });
    expect(still_granted).toBe(ConsentStatus.GRANTED);
    expect(unsubscribe.body).toEqual({ data: { unsubscribed: true } });
    expect(after.body.data.already_unsubscribed).toBe(true);
    expect(repeat.body).toEqual({ data: { unsubscribed: true } });
    expect((await context.contacts.get_contact('t1', 'c-bob'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
  });

  it('removes the contact from the next send and makes the old count stale', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await send(context, 3);
    await request(context.app).post(
      `/api/public/unsubscribe/${unsubscribe_token_in(context.email_sender.sent[1].message.html)}`,
    );
    // The first send finished, so start a fresh draft to the same audience.
    await request(context.app)
      .post('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body());

    const stale = await request(context.app)
      .post('/api/email_drafts/draft-2/send')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ confirm_recipient_count: 3 });
    const fresh = await request(context.app)
      .post('/api/email_drafts/draft-2/send')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ confirm_recipient_count: 2 });

    expect(stale.status).toBe(409);
    expect(stale.body.current).toBe(2);
    expect(fresh.status).toBe(200);
    expect(fresh.body.data.results.map((r: { contact_id: string }) => r.contact_id)).toEqual([
      'c-ann',
      'c-cyd',
    ]);
  });
});

describe('tenant isolation of sending', () => {
  it('uses only the sending tenant settings, contacts, games and links', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ api_key: 'SG.tenant-b', from_email: 'b@example.org' });
    await context.contacts.create_contact({
      ...(await context.contacts.get_contact('t1', 'c-ann'))!,
      tenant_id: 't2',
      contact_id: 'b-contact',
      email_address: 'bee@people.example.org',
    });
    await create_draft(context);

    const response = await send(context, 3);

    expect(response.status).toBe(200);
    expect(context.email_sender.sent.map((s) => s.message.to_email)).not.toContain(
      'bee@people.example.org',
    );
    expect(
      context.email_sender.sent.every((s) => s.credentials.api_key === SCENARIO_SETTINGS.api_key),
    ).toBe(true);
    expect(await context.quick_links.list_links('t2')).toEqual([]);
    expect(await context.email_deliveries.list_recipients('t2', 'draft-1')).toEqual([]);
  });

  it('configures email separately: a tenant without settings cannot send even if another has them', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await request(context.app)
      .post('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send(draft_body());

    const response = await request(context.app)
      .post('/api/email_drafts/draft-1/send')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ confirm_recipient_count: 0 });

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EMAIL_NOT_CONFIGURED');
  });
});
