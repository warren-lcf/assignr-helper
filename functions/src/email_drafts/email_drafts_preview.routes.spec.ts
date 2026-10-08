import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenBucketRateLimiter } from '../http/rate_limit/token_bucket_rate_limiter.js';
import { DeliveryErrorCode } from '../email_delivery/enums/delivery_error_code.enum.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import {
  IRoutesApp,
  OWNER_A_EMAIL,
  ROUTES_APP_ORIGIN,
  ROUTE_TOKENS,
  make_routes_app,
} from '../sync/make_routes_app.fixture.js';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import {
  HOUR,
  SCENARIO_SETTINGS,
  configure_email,
  draft_body,
  seed_contact,
  seed_email_scenario,
  seed_open_game,
} from './seed_email_scenario.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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
 * Previews draft-1 as the tenant-A owner.
 * @param context The routes app under test.
 * @returns The supertest request.
 */
function preview(context: IRoutesApp) {
  return request(context.app)
    .get('/api/email_drafts/draft-1/preview')
    .set(auth(ROUTE_TOKENS.owner_a));
}

describe('GET /api/email_drafts/:draft_id/preview', () => {
  it('renders the email from the live open games with placeholder links and counts', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { intro: 'Please help out.' });

    const response = await preview(context);

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(Object.keys(response.body.data).sort()).toEqual([
      'eligible_recipient_count',
      'game_count',
      'html',
      'skipped',
      'subject',
      'text',
      'warnings',
    ]);
    expect(response.body.data).toMatchObject({
      subject: 'Games this weekend',
      game_count: 2,
      eligible_recipient_count: 3,
      skipped: { unsubscribed: 0, missing: 0 },
      warnings: [],
    });
    const { html, text } = response.body.data;
    expect(html).toContain('Hawks vs Eagles');
    expect(html).toContain('Lions vs Tigers');
    expect(html).toContain('Please help out.');
    expect(html).toContain(`href="${ROUTES_APP_ORIGIN}/q/created-when-sent"`);
    expect(html).toContain(`href="${ROUTES_APP_ORIGIN}/unsubscribe/per-recipient-link"`);
    expect(html).toContain('Sent by Metro Referee Desk');
    expect(html).toContain('1 Main St, Springfield, VA 22150');
    expect(html).toContain('Hi Ann,');
    expect(text).toContain('Hawks vs Eagles');
    expect(text).toContain(`${ROUTES_APP_ORIGIN}/q/created-when-sent`);
  });

  it('leaves the quick link out when the draft has none', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { include_quick_link: false });

    const response = await preview(context);

    expect(response.body.data.html).not.toContain('/q/');
    expect(response.body.data.html).toContain('/unsubscribe/');
  });

  it('never creates a quick link, a delivery or a status change', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await preview(context);

    expect(await context.quick_links.list_links('t1')).toEqual([]);
    expect(await context.email_deliveries.list_recipients('t1', 'draft-1')).toEqual([]);
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.status).toBe('DRAFT');
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('drops a game that was taken since the draft was written', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    const before = await preview(context);

    await seed_open_game(context, 'g1', { is_open: false });
    const after = await preview(context);

    expect(before.body.data.game_count).toBe(2);
    expect(after.body.data.game_count).toBe(1);
    expect(after.body.data.html).not.toContain('Hawks vs Eagles');
    expect(after.body.data.html).toContain('Lions vs Tigers');
  });

  it('applies the draft filters', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context, { filters: { level: 'u14' } });

    const response = await preview(context);

    expect(response.body.data.game_count).toBe(1);
    expect(response.body.data.html).toContain('Lions vs Tigers');
    expect(response.body.data.html).not.toContain('Hawks');
  });

  it('applies the date window and never lists games that have started', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_open_game(context, 'g-started', { start_at: context.harness.clock() - HOUR });
    await seed_open_game(context, 'g-late', {
      start_at: context.harness.clock() + 48 * HOUR,
      home_team: 'Late',
      away_team: 'Game',
    });
    await create_draft(context, {
      filters: { date_to: context.harness.clock() + 24 * HOUR },
    });

    const response = await preview(context);

    expect(response.body.data.game_count).toBe(2);
    expect(response.body.data.html).not.toContain('Late vs Game');
  });

  it('leaves out cancelled games, games on nobody list, and other tenants games', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_open_game(context, 'g-cancelled', { status: GameStatus.CANCELLED });
    await seed_open_game(context, 'g-mine', { is_open: false, is_mine: true });
    await context.harness.games.save_games([
      make_contract_game('t2', 'g-other-tenant', {
        start_at: context.harness.clock() + HOUR,
        local_date: Date.UTC(2027, 0, 16),
      }),
    ]);
    await create_draft(context);

    const response = await preview(context);

    expect(response.body.data.game_count).toBe(2);
  });

  it('counts only consented contacts and reports the unsubscribed', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_contact(context, 'c-dee', 'Dee Day', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: 5,
    });
    await create_draft(context);

    const response = await preview(context);

    expect(response.body.data.eligible_recipient_count).toBe(3);
    expect(response.body.data.skipped).toEqual({ unsubscribed: 1, missing: 0 });
  });

  it('SELECTED: counts the chosen consenting contacts, reporting unsubscribed and deleted ones', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_contact(context, 'c-dee', 'Dee Day', {
      consent_status: ConsentStatus.UNSUBSCRIBED,
      unsubscribed_at: 5,
    });
    await seed_contact(context, 'c-eve', 'Eve East');
    await create_draft(context, {
      recipient_mode: 'SELECTED',
      contact_ids: ['c-ann', 'c-dee', 'c-eve'],
    });
    await context.contacts.delete_contact('t1', 'c-eve', 9, 'x');

    const response = await preview(context);

    expect(response.body.data.eligible_recipient_count).toBe(1);
    expect(response.body.data.skipped).toEqual({ unsubscribed: 1, missing: 1 });
  });

  it('lists the warnings in a stable order', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const unconfigured = await preview(context);
    await configure_email(context, { postal_address: null });
    const configured = await preview(context);

    expect(unconfigured.body.data.warnings).toEqual([
      'email_not_configured',
      'no_games',
      'no_recipients',
    ]);
    expect(configured.body.data.warnings).toEqual([
      'no_games',
      'no_recipients',
      'no_postal_address',
    ]);
  });

  it('warns about too many recipients', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    for (let i = 0; i < 100; i++) {
      await seed_contact(context, `extra-${i}`, `Extra ${i}`);
    }
    await create_draft(context);

    const response = await preview(context);

    expect(response.body.data.eligible_recipient_count).toBe(103);
    expect(response.body.data.warnings).toEqual(['too_many_recipients']);
  });

  it('warns when more games match than one email lists', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    for (let i = 0; i < 205; i++) {
      await seed_open_game(context, `bulk-${String(i).padStart(3, '0')}`, {
        start_at: context.harness.clock() + 2 * HOUR + i,
      });
    }
    await create_draft(context);

    const response = await preview(context);

    expect(response.body.data.game_count).toBe(200);
    expect(response.body.data.warnings).toEqual(['games_truncated']);
  });

  it('escapes anything a game or the draft brings into the HTML', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await seed_open_game(context, 'g-evil', { home_team: '<script>alert(1)</script>' });
    await create_draft(context, { intro: '<img src=x onerror=alert(1)>' });

    const response = await preview(context);

    expect(response.body.data.html).not.toContain('<script>');
    expect(response.body.data.html).not.toContain('<img src=x');
    expect(response.body.data.html).toContain('&lt;script&gt;');
  });

  it('answers 404 for another tenant draft and for an unknown one', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const other = await request(context.app)
      .get('/api/email_drafts/draft-1/preview')
      .set(auth(ROUTE_TOKENS.owner_b));
    const unknown = await request(context.app)
      .get('/api/email_drafts/nope/preview')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(other.status).toBe(404);
    expect(unknown.status).toBe(404);
  });

  it('never shows the API key', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await preview(context);

    expect(JSON.stringify(response.body)).not.toContain(SCENARIO_SETTINGS.api_key);
  });
});

describe('POST /api/email_drafts/:draft_id/test_send', () => {
  /**
   * Sends a test as the given token.
   * @param context The routes app under test.
   * @param token Bearer token.
   * @returns The supertest request.
   */
  function test_send(context: IRoutesApp, token: string = ROUTE_TOKENS.owner_a_verified) {
    return request(context.app).post('/api/email_drafts/draft-1/test_send').set(auth(token));
  }

  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
  });

  it('sends one email, only to the signed-in verified address, with a TEST subject and marked placeholder links', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await test_send(context);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { sent: true } });
    expect(context.email_sender.sent).toHaveLength(1);
    const [sent] = context.email_sender.sent;
    expect(sent.message.to_email).toBe(OWNER_A_EMAIL);
    expect(sent.message.subject).toBe('[TEST] Games this weekend');
    expect(sent.credentials).toEqual({
      api_key: SCENARIO_SETTINGS.api_key,
      from_email: SCENARIO_SETTINGS.from_email,
    });
    expect(sent.message.from_name).toBe('Metro Referee Desk');
    expect(sent.message.reply_to).toBe('reply@example.com');
    expect(sent.message.html).toContain('TEST EMAIL');
    expect(sent.message.text).toContain('placeholders');
    expect(sent.message.html).toContain(`${ROUTES_APP_ORIGIN}/q/created-when-sent`);
    expect(sent.message.html).toContain('Hawks vs Eagles');
  });

  it('does not change the draft, create a quick link or touch any contact', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    const before = await context.email_drafts.get_draft('t1', 'draft-1');

    await test_send(context);
    await test_send(context);

    expect(await context.email_drafts.get_draft('t1', 'draft-1')).toEqual(before);
    expect(await context.quick_links.list_links('t1')).toEqual([]);
    expect(await context.email_deliveries.list_recipients('t1', 'draft-1')).toEqual([]);
    expect(context.email_sender.sent.every((s) => s.message.to_email === OWNER_A_EMAIL)).toBe(true);
  });

  it('ignores any address in the request: the recipient comes from the verified token only', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await test_send(context).send({ to: 'victim@example.com', to_email: 'victim@example.com' });

    expect(context.email_sender.sent.map((s) => s.message.to_email)).toEqual([OWNER_A_EMAIL]);
  });

  it.each([
    ['has no email on the account', ROUTE_TOKENS.owner_a],
    ['has an email the identity provider has not verified', ROUTE_TOKENS.owner_a_unverified],
  ])('answers 409 NO_EMAIL_ON_ACCOUNT when the account %s', async (_label, token) => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    const response = await test_send(context, token);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('NO_EMAIL_ON_ACCOUNT');
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('answers 422 EMAIL_NOT_CONFIGURED without settings', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await test_send(context);

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('EMAIL_NOT_CONFIGURED');
  });

  it('answers 404 for another tenant draft', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    await request(context.app)
      .put('/api/email/settings')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ api_key: 'SG.b', from_email: 'b@example.org' });

    const response = await request(context.app)
      .post('/api/email_drafts/draft-1/test_send')
      .set(auth(ROUTE_TOKENS.owner_b_verified));

    expect(response.status).toBe(404);
    expect(context.email_sender.attempts).toEqual([]);
  });

  it('answers 502 with a safe code, no vendor text and a masked log when the provider refuses', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    context.email_sender.failures.set(OWNER_A_EMAIL, DeliveryErrorCode.PROVIDER_AUTH);

    const response = await test_send(context);

    expect(response.status).toBe(502);
    expect(response.body.code).toBe('EMAIL_DELIVERY_FAILED');
    expect(response.body.violations).toEqual([{ path: 'error_code', message: 'PROVIDER_AUTH' }]);
    expect(JSON.stringify(response.body)).not.toContain(OWNER_A_EMAIL);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain('o***@e***.test');
    expect(logged).not.toContain(OWNER_A_EMAIL);
    expect(logged).not.toContain(SCENARIO_SETTINGS.api_key);
    expect(context.audit.rows.filter((r) => r.resource_type === 'email_draft_test_send')).toEqual(
      [],
    );
  });

  it('audits a successful test with a masked address', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);

    await test_send(context);

    const row = context.audit.rows.find((r) => r.resource_type === 'email_draft_test_send');
    expect(row).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_id: 'draft-1',
      action: 'CREATE',
    });
    expect(JSON.stringify(row)).toContain('o***@e***.test');
    expect(JSON.stringify(row)).not.toContain(OWNER_A_EMAIL);
  });

  it('is rate limited per tenant and user', async () => {
    const context = make_routes_app({
      test_send_limiter: new TokenBucketRateLimiter({
        capacity: 2,
        refill_per_minute: 1,
        max_keys: 10,
        now: () => 1_800_000_000_000,
      }),
    });
    await seed_email_scenario(context);
    await create_draft(context);

    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await test_send(context)).status);
    const third = await test_send(context);

    expect(statuses).toEqual([200, 200, 429]);
    expect(third.headers['retry-after']).toBeDefined();
    expect(third.body.code).toBe('RATE_LIMITED');
    expect(context.email_sender.sent).toHaveLength(2);
  });
});
