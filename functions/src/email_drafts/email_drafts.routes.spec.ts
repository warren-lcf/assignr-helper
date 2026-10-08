import request from 'supertest';
import { http_call, type HttpMethod } from '../http/http_call.fixture.js';
import { describe, expect, it } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import { draft_body, seed_contact, seed_email_scenario } from './seed_email_scenario.fixture.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Creates a draft as the tenant-A owner.
 * @param context The routes app under test.
 * @param overrides Body fields to replace.
 * @returns The supertest request.
 */
function create_draft(context: IRoutesApp, overrides: Record<string, unknown> = {}) {
  return request(context.app)
    .post('/api/email_drafts')
    .set(auth(ROUTE_TOKENS.owner_a))
    .send(draft_body(overrides));
}

describe('permission and tenant gating', () => {
  const routes: [HttpMethod, string, object | undefined][] = [
    ['get', '/api/email_drafts', undefined],
    ['post', '/api/email_drafts', draft_body()],
    ['get', '/api/email_drafts/d1', undefined],
    ['put', '/api/email_drafts/d1', draft_body()],
    ['delete', '/api/email_drafts/d1', undefined],
    ['get', '/api/email_drafts/d1/preview', undefined],
    ['post', '/api/email_drafts/d1/test_send', undefined],
    ['post', '/api/email_drafts/d1/send', { confirm_recipient_count: 1 }],
  ];

  it.each(routes)('%s %s requires sign-in', async (method, path, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, path);

    expect((await (body ? call.send(body) : call)).status).toBe(401);
  });

  it.each(routes)('%s %s is forbidden to a plain member', async (method, path, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, path).set(auth(ROUTE_TOKENS.member_a));

    expect((await (body ? call.send(body) : call)).status).toBe(403);
    expect(await context.email_drafts.list_drafts('t1', 10)).toEqual([]);
  });

  it.each(routes)(
    '%s %s is forbidden to an owner viewing as a plain member',
    async (method, path, body) => {
      const context = make_routes_app();
      const call = http_call(context.app, method, path)
        .set(auth(ROUTE_TOKENS.owner_a))
        .set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER');

      expect((await (body ? call.send(body) : call)).status).toBe(403);
    },
  );

  it.each(routes)(
    '%s %s asks a platform administrator with no tenant view to pick a tenant',
    async (method, path, body) => {
      const context = make_routes_app();
      const call = http_call(context.app, method, path).set(auth(ROUTE_TOKENS.admin));

      const response = await (body ? call.send(body) : call);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TENANT_REQUIRED');
    },
  );

  it('lets a platform administrator act for a tenant and records both roles', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_OWNER')
      .send(draft_body());

    expect(response.status).toBe(201);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      tenant_id: 't1',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.created_by).toBe('u-admin');
  });
});

describe('POST /api/email_drafts', () => {
  it('creates a draft in status DRAFT and answers with the contract view', async () => {
    const context = make_routes_app();
    const now = context.harness.clock();

    const response = await create_draft(context, {
      intro: 'Hello there',
      filters: { level: 'U12', only_with_open_slots: true, date_from: 1_900_000_000_000 },
      quick_link_expiry_days: 30,
    });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        draft: {
          draft_id: 'draft-1',
          subject: 'Games this weekend',
          intro: 'Hello there',
          filters: {
            search: null,
            level: 'U12',
            league: null,
            age_group: null,
            location_group: null,
            organization_id: null,
            connection_id: null,
            only_with_open_slots: true,
            date_from: 1_900_000_000_000,
            date_to: null,
          },
          include_quick_link: true,
          quick_link_expiry_days: 30,
          recipient_mode: 'ALL_CONSENTED',
          contact_ids: [],
          status: 'DRAFT',
          recipient_count: null,
          sent_at: null,
          created_at: now,
          updated_at: now,
        },
      },
    });
  });

  it('defaults the expiry to 14 days and fills every filter', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({
        subject: 'Hi',
        filters: {},
        include_quick_link: false,
        recipient_mode: 'ALL_CONSENTED',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.draft.quick_link_expiry_days).toBe(14);
    expect(response.body.data.draft.intro).toBeNull();
    expect(Object.keys(response.body.data.draft.filters)).toHaveLength(10);
  });

  it('keeps blank filter text out and stores the chosen contacts for SELECTED', async () => {
    const context = make_routes_app();
    await seed_contact(context, 'c1', 'Ann');
    await seed_contact(context, 'c2', 'Bob');

    const response = await create_draft(context, {
      filters: { search: '   ', league: '' },
      recipient_mode: 'SELECTED',
      contact_ids: ['c2', 'c1', 'c2'],
    });

    expect(response.status).toBe(201);
    expect(response.body.data.draft.filters.search).toBeNull();
    expect(response.body.data.draft.filters.league).toBeNull();
    expect(response.body.data.draft.contact_ids).toEqual(['c2', 'c1']);
  });

  it('writes an audit row with the choices but no addresses', async () => {
    const context = make_routes_app();
    await seed_contact(context, 'c1', 'Ann');

    await create_draft(context, { recipient_mode: 'SELECTED', contact_ids: ['c1'] });

    expect(context.audit.rows).toHaveLength(1);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_type: 'email_draft',
      resource_id: 'draft-1',
      action: 'CREATE',
    });
    expect(JSON.parse(context.audit.rows[0].after_state_json ?? 'null')).toMatchObject({
      selected_contact_count: 1,
      recipient_mode: 'SELECTED',
    });
    expect(JSON.stringify(context.audit.rows)).not.toContain('example.com');
  });

  it.each([
    ['an unknown field', { tenant_id: 't2' }],
    ['an unknown filter', { filters: { status: 'x' } }],
    ['a blank subject', { subject: '   ' }],
    ['a subject over 200 characters', { subject: 'x'.repeat(201) }],
    ['a line feed in the subject', { subject: 'Games\nBcc: evil@example.com' }],
    ['a carriage return in the subject', { subject: 'Games\r\nBcc: evil@example.com' }],
    ['a control character in the subject', { subject: 'Games\u0000' }],
    ['an intro over 2000 characters', { intro: 'x'.repeat(2001) }],
    ['a control character in the intro', { intro: 'Hello\u0000' }],
    ['a search over 100 characters', { filters: { search: 'x'.repeat(101) } }],
    ['a line break in a filter', { filters: { level: 'U12\nX' } }],
    ['a level over 64 characters', { filters: { level: 'x'.repeat(65) } }],
    ['an organization id with odd characters', { filters: { organization_id: 'a b' } }],
    ['a connection id with a slash', { filters: { connection_id: 'a/b' } }],
    ['a non-boolean open slots flag', { filters: { only_with_open_slots: 'yes' } }],
    ['a negative date', { filters: { date_from: -1 } }],
    ['a fractional date', { filters: { date_from: 1.5 } }],
    ['a date past 2200', { filters: { date_to: 9_000_000_000_000_000 } }],
    [
      'a reversed window',
      { filters: { date_from: 2_000_000_000_000, date_to: 1_900_000_000_000 } },
    ],
    [
      'a window over 400 days',
      { filters: { date_from: 1_900_000_000_000, date_to: 1_900_000_000_000 + 401 * 86_400_000 } },
    ],
    ['an expiry of 0 days', { quick_link_expiry_days: 0 }],
    ['an expiry of 91 days', { quick_link_expiry_days: 91 }],
    ['a fractional expiry', { quick_link_expiry_days: 1.5 }],
    ['a text expiry', { quick_link_expiry_days: '14' }],
    ['a missing quick link choice', { include_quick_link: undefined }],
    ['a text quick link choice', { include_quick_link: 'yes' }],
    ['an unknown recipient mode', { recipient_mode: 'EVERYONE' }],
    ['a missing recipient mode', { recipient_mode: undefined }],
    ['contact ids with ALL_CONSENTED', { contact_ids: ['c1'] }],
    ['an invalid contact id', { recipient_mode: 'SELECTED', contact_ids: ['bad id'] }],
    [
      'more than 500 contact ids',
      {
        recipient_mode: 'SELECTED',
        contact_ids: Array.from({ length: 501 }, (_, i) => `c${i}`),
      },
    ],
    ['a missing subject', { subject: undefined }],
    ['missing filters', { filters: undefined }],
  ])('answers 400, never 500, and stores nothing for %s', async (_label, patch) => {
    const context = make_routes_app();

    const response = await create_draft(context, patch);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(response.body.violations)).toBe(true);
    expect(await context.email_drafts.list_drafts('t1', 10)).toEqual([]);
  });

  it('accepts exactly 500 contact ids that exist', async () => {
    const context = make_routes_app();
    for (let i = 0; i < 500; i++) {
      await seed_contact(context, `c${i}`, `Contact ${i}`);
    }

    const response = await create_draft(context, {
      recipient_mode: 'SELECTED',
      contact_ids: Array.from({ length: 500 }, (_, i) => `c${i}`),
    });

    expect(response.status).toBe(201);
    expect(response.body.data.draft.contact_ids).toHaveLength(500);
  });

  it('refuses contacts that do not exist or belong to another tenant, naming each', async () => {
    const context = make_routes_app();
    await seed_contact(context, 'mine', 'Mine');
    await context.contacts.create_contact({
      ...(await context.contacts.get_contact('t1', 'mine'))!,
      tenant_id: 't2',
      contact_id: 'theirs',
      email_address: 'theirs@people.example.com',
    });

    const response = await create_draft(context, {
      recipient_mode: 'SELECTED',
      contact_ids: ['mine', 'theirs', 'ghost'],
    });

    expect(response.status).toBe(400);
    expect(response.body.violations.map((v: { path: string }) => v.path)).toEqual([
      'contact_ids.1',
      'contact_ids.2',
    ]);
    expect(await context.email_drafts.list_drafts('t1', 10)).toEqual([]);
  });
});

describe('GET /api/email_drafts and /api/email_drafts/:draft_id', () => {
  it('lists the tenant drafts newest first and none of another tenant', async () => {
    const context = make_routes_app();
    await create_draft(context, { subject: 'First' });
    await create_draft(context, { subject: 'Second' });
    await request(context.app)
      .post('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send(draft_body({ subject: 'Other tenant' }));

    const mine = await request(context.app)
      .get('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_a));
    const theirs = await request(context.app)
      .get('/api/email_drafts')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(mine.status).toBe(200);
    expect(mine.body.data.drafts.map((d: { subject: string }) => d.subject)).toEqual([
      'Second',
      'First',
    ]);
    expect(theirs.body.data.drafts.map((d: { subject: string }) => d.subject)).toEqual([
      'Other tenant',
    ]);
  });

  it('reads one draft', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .get('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.draft.draft_id).toBe('draft-1');
  });

  it('answers 404 for an unknown draft and for another tenant draft', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const unknown = await request(context.app)
      .get('/api/email_drafts/nope')
      .set(auth(ROUTE_TOKENS.owner_a));
    const other = await request(context.app)
      .get('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(unknown.status).toBe(404);
    expect(other.status).toBe(404);
    expect(other.body.code).toBe('NOT_FOUND');
  });

  it('answers 400 for an id that is not an id', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get('/api/email_drafts/bad%20id')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
  });
});

describe('PUT /api/email_drafts/:draft_id', () => {
  it('replaces the content and moves the version forward', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(
        draft_body({
          subject: 'Changed',
          include_quick_link: false,
          filters: { league: 'Spring' },
        }),
      );

    expect(response.status).toBe(200);
    expect(response.body.data.draft).toMatchObject({
      draft_id: 'draft-1',
      subject: 'Changed',
      include_quick_link: false,
      status: 'DRAFT',
    });
    expect(response.body.data.draft.filters.league).toBe('Spring');
    expect(response.body.data.draft.updated_at).toBeGreaterThan(
      response.body.data.draft.created_at,
    );
    expect(context.audit.rows.map((row) => row.action)).toEqual(['CREATE', 'UPDATE']);
  });

  it('is locked once the draft is not a DRAFT', async () => {
    const context = make_routes_app();
    await create_draft(context);
    const stored = (await context.email_drafts.get_draft('t1', 'draft-1'))!;
    await context.email_drafts.begin_send('t1', 'draft-1', stored.updated_at + 1, 'x', 600_000);

    const response = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body({ subject: 'Too late' }));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DRAFT_LOCKED');
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.subject).toBe(
      'Games this weekend',
    );
  });

  it.each([DraftStatus.SENT, DraftStatus.PARTIALLY_SENT])(
    'is locked for a %s draft',
    async (status) => {
      const context = make_routes_app();
      await create_draft(context);
      const stored = (await context.email_drafts.get_draft('t1', 'draft-1'))!;
      await context.email_drafts.begin_send('t1', 'draft-1', stored.updated_at + 1, 'x', 600_000);
      await context.email_drafts.finish_send(
        't1',
        'draft-1',
        { status: status as DraftStatus.SENT, recipient_count: 1, quick_link_id: null, sent_at: 1 },
        stored.updated_at + 2,
        'x',
      );

      const response = await request(context.app)
        .put('/api/email_drafts/draft-1')
        .set(auth(ROUTE_TOKENS.owner_a))
        .send(draft_body());

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DRAFT_LOCKED');
    },
  );

  it('answers 404 for another tenant draft and changes nothing', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send(draft_body({ subject: 'Hijack' }));

    expect(response.status).toBe(404);
    expect((await context.email_drafts.get_draft('t1', 'draft-1'))?.subject).toBe(
      'Games this weekend',
    );
  });

  it('validates the body before looking anything up', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body({ subject: 'Bad\r\nBcc: x@example.com' }));

    expect(response.status).toBe(400);
  });

  it('refuses contacts of another tenant', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .put('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(draft_body({ recipient_mode: 'SELECTED', contact_ids: ['ghost'] }));

    expect(response.status).toBe(400);
    expect(response.body.violations[0].path).toBe('contact_ids.0');
  });
});

describe('DELETE /api/email_drafts/:draft_id', () => {
  it('deletes a draft and audits it', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const response = await request(context.app)
      .delete('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { deleted: true } });
    expect(await context.email_drafts.get_draft('t1', 'draft-1')).toBeNull();
    expect(context.audit.rows.map((row) => row.action)).toEqual(['CREATE', 'DELETE']);
  });

  it('refuses to delete a draft that is sending or sent', async () => {
    const context = make_routes_app();
    await seed_email_scenario(context);
    await create_draft(context);
    const stored = (await context.email_drafts.get_draft('t1', 'draft-1'))!;
    await context.email_drafts.begin_send('t1', 'draft-1', stored.updated_at + 1, 'x', 600_000);

    const response = await request(context.app)
      .delete('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('DRAFT_LOCKED');
    expect(await context.email_drafts.get_draft('t1', 'draft-1')).not.toBeNull();
  });

  it('answers 404 for an unknown draft and for another tenant draft, deleting nothing', async () => {
    const context = make_routes_app();
    await create_draft(context);

    const unknown = await request(context.app)
      .delete('/api/email_drafts/nope')
      .set(auth(ROUTE_TOKENS.owner_a));
    const other = await request(context.app)
      .delete('/api/email_drafts/draft-1')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(unknown.status).toBe(404);
    expect(other.status).toBe(404);
    expect(await context.email_drafts.get_draft('t1', 'draft-1')).not.toBeNull();
  });
});
