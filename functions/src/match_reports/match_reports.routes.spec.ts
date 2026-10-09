import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { AppRole } from '../auth/enums/app_role.enum.js';
import '../auth/express_request_auth.augmentation.js';
import { MatchReportStatus } from '../domain/match_reports/match_report_status.enum.js';
import { HttpMethod, http_call } from '../http/http_call.fixture.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { MatchReportWriteOutcome } from './enums/match_report_write_outcome.enum.js';
import { create_match_reports_router } from './match_reports.routes.js';
import { make_contract_edit } from './stores/contracts/make_contract_match_report.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** The routes the specs drive generically. */
const ROUTES: { method: HttpMethod; path: string; writes: boolean; body?: object }[] = [
  { method: 'post', path: '/api/match_reports', writes: true, body: { game_id: 'g1' } },
  { method: 'get', path: '/api/match_reports', writes: false },
  { method: 'get', path: '/api/match_reports/r1', writes: false },
  {
    method: 'put',
    path: '/api/match_reports/r1/scores',
    writes: true,
    body: { home_score: 1, away_score: 0, client_revision: 0 },
  },
  {
    method: 'post',
    path: '/api/match_reports/r1/incidents',
    writes: true,
    body: { idempotency_key: 'abcd1234', team_side: 'HOME', incident_type: 'YELLOW' },
  },
  { method: 'delete', path: '/api/match_reports/r1/incidents/i1', writes: true },
  { method: 'post', path: '/api/match_reports/r1/ready', writes: true },
  { method: 'post', path: '/api/match_reports/r1/reopen', writes: true },
];

/**
 * Seeds one of tenant t1's own scheduled games.
 * @param context The routes app under test.
 * @param game_id Primary key of the game.
 * @param overrides Fields to replace.
 * @returns Resolves when the game is stored.
 */
async function seed_game(
  context: IRoutesApp,
  game_id: string,
  overrides: Parameters<typeof make_contract_game>[2] = {},
): Promise<void> {
  await context.harness.games.save_games([
    make_contract_game('t1', game_id, { is_mine: true, ...overrides }),
  ]);
}

/**
 * Opens the report of a game as the given user.
 * @param context The routes app under test.
 * @param game_id Game to report on.
 * @param token Bearer token to sign in with.
 * @returns The report id.
 */
async function open_report(
  context: IRoutesApp,
  game_id = 'g1',
  token: string = ROUTE_TOKENS.owner_a,
): Promise<string> {
  const response = await request(context.app)
    .post('/api/match_reports')
    .set(auth(token))
    .send({ game_id });
  return response.body.data.report.report_id as string;
}

/**
 * Builds a ready-to-mark report: scores set and one card.
 * @param context The routes app under test.
 * @returns The report id.
 */
async function make_complete_report(context: IRoutesApp): Promise<string> {
  await seed_game(context, 'g1');
  const id = await open_report(context);
  await request(context.app)
    .put(`/api/match_reports/${id}/scores`)
    .set(auth(ROUTE_TOKENS.owner_a))
    .send({ home_score: 2, away_score: 1, notes: 'Secret match notes', client_revision: 0 });
  await request(context.app)
    .post(`/api/match_reports/${id}/incidents`)
    .set(auth(ROUTE_TOKENS.owner_a))
    .send({ idempotency_key: 'key-aaaa0001', team_side: 'AWAY', incident_type: 'RED' });
  return id;
}

describe('access', () => {
  it.each(ROUTES)('$method $path requires sign-in', async ({ method, path, body }) => {
    const context = make_routes_app();

    const response = await http_call(context.app, method, path).send(body);

    expect(response.status).toBe(401);
  });

  it.each(ROUTES)('$method $path lets a plain member in', async ({ method, path, body }) => {
    const context = make_routes_app();

    const response = await http_call(context.app, method, path)
      .set(auth(ROUTE_TOKENS.member_a))
      .send(body);

    expect([401, 403]).not.toContain(response.status);
  });

  it.each(ROUTES)(
    '$method $path asks a platform administrator with no tenant view to pick a tenant',
    async ({ method, path, body }) => {
      const context = make_routes_app();

      const response = await http_call(context.app, method, path)
        .set(auth(ROUTE_TOKENS.admin))
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('TENANT_REQUIRED');
    },
  );

  it('lets a platform administrator act for a tenant', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .send({ game_id: 'g1' });

    expect(response.status).toBe(201);
    expect((await context.match_reports.get_report('t1', 'mr-1'))?.created_by).toBe('u-admin');
  });

  /**
   * Builds an app whose caller holds only the given permissions, over the real service.
   * @param context Routes app whose service and store are reused.
   * @param allowed Permission keys the caller's role holds.
   * @returns The Express app.
   */
  function make_app_with_permissions(context: IRoutesApp, allowed: string[]) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const identity = { uid: 'u1', email: null, tenant_id: 't1', role: AppRole.TENANT_MEMBER };
      req.auth = { real: identity, effective: identity };
      next();
    });
    app.use(
      '/api',
      create_match_reports_router({
        report_service: context.match_report_service,
        permission_service: {
          role_has_permission: async (_role: string, key: string) => allowed.includes(key),
        } as never,
      }),
    );
    return app;
  }

  it.each(ROUTES.filter((route) => !route.writes))(
    'a caller who can only read may $method $path',
    async ({ method, path }) => {
      const context = make_routes_app();
      const app = make_app_with_permissions(context, ['games.read']);

      const response = await http_call(app, method, path);

      expect(response.status).not.toBe(403);
    },
  );

  it.each(ROUTES.filter((route) => route.writes))(
    'a caller who can only read may not $method $path',
    async ({ method, path, body }) => {
      const context = make_routes_app();
      const app = make_app_with_permissions(context, ['games.read']);

      const response = await http_call(app, method, path).send(body);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('reports.write');
    },
  );

  it.each(ROUTES.filter((route) => !route.writes))(
    'a caller who can only write may not $method $path',
    async ({ method, path }) => {
      const context = make_routes_app();
      const app = make_app_with_permissions(context, ['reports.write']);

      const response = await http_call(app, method, path);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('games.read');
    },
  );

  it.each(ROUTES.filter((route) => route.writes))(
    'a caller who can only write may $method $path',
    async ({ method, path, body }) => {
      const context = make_routes_app();
      const app = make_app_with_permissions(context, ['reports.write']);

      const response = await http_call(app, method, path).send(body);

      expect(response.status).not.toBe(403);
    },
  );
});

describe('POST /api/match_reports', () => {
  it('creates the draft report with 201 and the full view', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ game_id: 'g1' });

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        report: {
          report_id: 'mr-1',
          game_id: 'g1',
          status: 'DRAFT',
          home_score: null,
          away_score: null,
          notes: null,
          incidents: [],
          client_revision: 0,
          lock_version: 0,
          created_at: expect.any(Number),
          updated_at: expect.any(Number),
        },
      },
    });
  });

  it('answers 200 with the same report when the game already has one', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const first = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ game_id: 'g1' });

    const second = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.member_a))
      .send({ game_id: 'g1' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(
      await context.match_reports.list_reports('t1', { status: null, game_id: null, limit: 10 }),
    ).toHaveLength(1);
  });

  it.each([
    ['an unknown game', async () => undefined, 'g404'],
    [
      "an open game that is not the referee's own",
      async (context: IRoutesApp) => seed_game(context, 'g2', { is_mine: false, is_open: true }),
      'g2',
    ],
    [
      'a removed game',
      async (context: IRoutesApp) => seed_game(context, 'g3', { removed_at: 5 }),
      'g3',
    ],
    [
      "another tenant's game",
      async (context: IRoutesApp) =>
        context.harness.games.save_games([make_contract_game('t2', 'g4', { is_mine: true })]),
      'g4',
    ],
  ])('answers 404 for %s and stores nothing', async (_name, seed, game_id) => {
    const context = make_routes_app();
    await seed(context);

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ game_id });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
    expect(
      await context.match_reports.list_reports('t1', { status: null, game_id: null, limit: 10 }),
    ).toEqual([]);
  });

  it('answers 409 GAME_CANCELLED for a cancelled game and stores nothing', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1', { status: GameStatus.CANCELLED });

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ game_id: 'g1' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('GAME_CANCELLED');
    expect(await context.match_reports.get_report_by_game('t1', 'g1')).toBeNull();
  });

  it('does not let another tenant see that a game exists', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1', { status: GameStatus.CANCELLED });

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ game_id: 'g1' });

    expect(response.status).toBe(404);
  });

  it.each([
    ['no game id', {}],
    ['a blank game id', { game_id: '' }],
    ['a game id with bad characters', { game_id: 'a b' }],
    ['an unknown field', { game_id: 'g1', tenant_id: 't2' }],
  ])('rejects %s with a 400', async (_name, body) => {
    const context = make_routes_app();
    await seed_game(context, 'g1');

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.violations.length).toBeGreaterThan(0);
  });

  it('answers 400, not 500, when there is no body at all', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
  });

  it('answers 500 without leaking the cause when the store fails', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = make_routes_app();
    await seed_game(context, 'g1');
    context.match_reports.create_report_if_absent = async () => {
      throw new Error('spanner exploded');
    };

    const response = await request(context.app)
      .post('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ game_id: 'g1' });

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('spanner exploded');
    error_spy.mockRestore();
  });
});

describe('GET /api/match_reports', () => {
  it('lists summaries newest first with the card counts and no notes', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    await seed_game(context, 'g2');
    const first = await open_report(context, 'g1');
    context.harness.advance(5000);
    const second = await open_report(context, 'g2');
    await request(context.app)
      .put(`/api/match_reports/${first}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ home_score: 3, away_score: 2, notes: 'Secret note', client_revision: 0 });
    await request(context.app)
      .post(`/api/match_reports/${first}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ idempotency_key: 'key-aaaa0001', team_side: 'HOME', incident_type: 'YELLOW' });
    await request(context.app)
      .post(`/api/match_reports/${first}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ idempotency_key: 'key-aaaa0002', team_side: 'AWAY', incident_type: 'RED' });

    const response = await request(context.app)
      .get('/api/match_reports')
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(response.body.data.reports.map((r: { report_id: string }) => r.report_id)).toEqual([
      second,
      first,
    ]);
    expect(response.body.data.reports[1]).toEqual({
      report_id: first,
      game_id: 'g1',
      status: 'DRAFT',
      home_score: 3,
      away_score: 2,
      yellow_count: 1,
      red_count: 1,
      updated_at: expect.any(Number),
    });
    expect(JSON.stringify(response.body)).not.toContain('Secret note');
  });

  it('filters by status and by game', async () => {
    const context = make_routes_app();
    const ready_id = await make_complete_report(context);
    await request(context.app)
      .post(`/api/match_reports/${ready_id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));
    await seed_game(context, 'g2');
    await open_report(context, 'g2');
    const list = (query: string) =>
      request(context.app).get(`/api/match_reports${query}`).set(auth(ROUTE_TOKENS.owner_a));

    const ready = await list('?status=READY');
    const drafts = await list('?status=DRAFT');
    const one_game = await list('?game_id=g2');
    const blank = await list('?status=&game_id=');

    expect(ready.body.data.reports.map((r: { game_id: string }) => r.game_id)).toEqual(['g1']);
    expect(drafts.body.data.reports.map((r: { game_id: string }) => r.game_id)).toEqual(['g2']);
    expect(one_game.body.data.reports.map((r: { game_id: string }) => r.game_id)).toEqual(['g2']);
    expect(blank.body.data.reports).toHaveLength(2);
  });

  it('caps the list at 200 reports', async () => {
    const context = make_routes_app();
    const spy = vi.spyOn(context.match_reports, 'list_reports');

    await request(context.app).get('/api/match_reports').set(auth(ROUTE_TOKENS.owner_a));

    expect(spy).toHaveBeenCalledWith('t1', { status: null, game_id: null, limit: 200 });
  });

  it("lists only the caller's tenant", async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    await open_report(context);

    const response = await request(context.app)
      .get('/api/match_reports')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.body).toEqual({ data: { reports: [] } });
  });

  it.each([
    ['an unknown parameter', '?limit=5'],
    ['an unknown status', '?status=DONE'],
    ['a repeated status', '?status=DRAFT&status=READY'],
    ['a game id with bad characters', '?game_id=a%20b'],
  ])('rejects %s with a 400', async (_name, query) => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get(`/api/match_reports${query}`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/match_reports/:report_id', () => {
  it('returns the report with its incidents and no tenant or audit actors', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .get(`/api/match_reports/${id}`)
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(response.body.data.report).toMatchObject({
      report_id: id,
      game_id: 'g1',
      status: 'DRAFT',
      home_score: 2,
      away_score: 1,
      notes: 'Secret match notes',
    });
    expect(response.body.data.report.incidents).toEqual([
      {
        incident_id: expect.any(String),
        idempotency_key: 'key-aaaa0001',
        team_side: 'AWAY',
        jersey_number: null,
        incident_type: 'RED',
        minute: null,
        reason_code: null,
        notes: null,
      },
    ]);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('tenant_id');
    expect(text).not.toContain('created_by');
    expect(text).not.toContain('u-owner-a');
  });

  it("answers 404 for another tenant's report and for an unknown one", async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const foreign = await request(context.app)
      .get(`/api/match_reports/${id}`)
      .set(auth(ROUTE_TOKENS.owner_b));
    const unknown = await request(context.app)
      .get('/api/match_reports/nope')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(foreign.status).toBe(404);
    expect(foreign.body.code).toBe('NOT_FOUND');
    expect(unknown.status).toBe(404);
    expect(JSON.stringify(foreign.body)).not.toContain('g1');
  });

  it('answers 400 for a malformed id', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .get(`/api/match_reports/${'x'.repeat(65)}`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
  });
});

describe('PUT /api/match_reports/:report_id/scores', () => {
  it('saves the scores and notes and returns the report', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.member_a))
      .send({ home_score: 4, away_score: 0, notes: 'Done', client_revision: 0 });

    expect(response.status).toBe(200);
    expect(response.body.data.report).toMatchObject({
      home_score: 4,
      away_score: 0,
      notes: 'Done',
      client_revision: 1,
      lock_version: 1,
    });
    expect((await context.match_reports.get_report('t1', id))?.updated_by).toBe('u-member-a');
  });

  it('ignores a delayed edit based on an older revision and answers 200 with the stored report', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const put = (body: object) =>
      request(context.app)
        .put(`/api/match_reports/${id}/scores`)
        .set(auth(ROUTE_TOKENS.owner_a))
        .send(body);
    await put({ home_score: 1, away_score: 1, client_revision: 0 });
    const newest = await put({ home_score: 5, away_score: 5, client_revision: 1 });

    const delayed = await put({ home_score: 1, away_score: 1, client_revision: 0 });

    expect(delayed.status).toBe(200);
    expect(delayed.body).toEqual(newest.body);
    expect(delayed.body.data.report.home_score).toBe(5);
  });

  it('answers 409 REPORT_NOT_EDITABLE for a ready report', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ home_score: 9, away_score: 9, client_revision: 50 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPORT_NOT_EDITABLE');
    expect((await context.match_reports.get_report('t1', id))?.home_score).toBe(2);
  });

  it("answers 404 for another tenant's report and changes nothing", async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ home_score: 9, away_score: 9, client_revision: 50 });

    expect(response.status).toBe(404);
    expect((await context.match_reports.get_report('t1', id))?.home_score).toBe(2);
  });

  it.each([
    ['a missing revision', { home_score: 1, away_score: 1 }],
    ['a score of 100', { home_score: 100, away_score: 1, client_revision: 0 }],
    ['a negative score', { home_score: 1, away_score: -1, client_revision: 0 }],
    ['a fractional score', { home_score: 1.5, away_score: 1, client_revision: 0 }],
    ['a missing score', { home_score: 1, client_revision: 0 }],
    [
      'notes over 2000 characters',
      { home_score: 1, away_score: 1, client_revision: 0, notes: 'n'.repeat(2001) },
    ],
    ['an unknown field', { home_score: 1, away_score: 1, client_revision: 0, status: 'READY' }],
  ])('rejects %s with a 400 and changes nothing', async (_name, body) => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect((await context.match_reports.get_report('t1', id))?.lock_version).toBe(0);
  });

  it('never echoes what it was sent in an error', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({
        home_score: 4242,
        away_score: 1,
        client_revision: 0,
        notes: 'SECRET-NOTE'.repeat(300),
      });

    expect(response.status).toBe(400);
    expect(response.text).not.toContain('SECRET-NOTE');
    expect(response.text).not.toContain('4242');
  });

  it('answers 409 REPORT_CONFLICT when the report keeps changing under the write', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    vi.spyOn(context.match_reports, 'apply_edit').mockResolvedValue({
      outcome: MatchReportWriteOutcome.LOST_RACE,
      report: null,
    });

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ home_score: 1, away_score: 1, client_revision: 0 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPORT_CONFLICT');
  });

  it('recovers from a lost race and answers 200', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const original = context.match_reports.apply_edit.bind(context.match_reports);
    const base = (await context.match_reports.get_report('t1', id))!;
    vi.spyOn(context.match_reports, 'apply_edit').mockImplementationOnce(async (...args) => {
      await original('t1', id, 0, make_contract_edit(base, { notes: 'rival' }), 1, 'rival');
      return original(...args);
    });

    const response = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ home_score: 2, away_score: 2, client_revision: 0 });

    expect(response.status).toBe(200);
    expect(response.body.data.report).toMatchObject({
      home_score: 2,
      notes: 'rival',
      lock_version: 2,
    });
  });

  it('writes no audit row for an ordinary edit', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ home_score: 2, away_score: 2, client_revision: 0 });

    expect(context.audit.rows).toHaveLength(0);
  });
});

describe('POST /api/match_reports/:report_id/incidents', () => {
  const INCIDENT = {
    idempotency_key: 'abcd1234',
    team_side: 'HOME',
    incident_type: 'YELLOW',
    jersey_number: 9,
    minute: 41,
    reason_code: 'DISSENT',
    notes: 'Argued with the referee',
  };

  it('records the incident with 201 and returns the report', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.member_a))
      .send(INCIDENT);

    expect(response.status).toBe(201);
    expect(response.body.data.report.incidents).toEqual([
      {
        incident_id: expect.any(String),
        idempotency_key: 'abcd1234',
        team_side: 'HOME',
        jersey_number: 9,
        incident_type: 'YELLOW',
        minute: 41,
        reason_code: 'DISSENT',
        notes: 'Argued with the referee',
      },
    ]);
    const stored = await context.match_reports.get_report('t1', id);
    expect(stored?.incidents[0]?.created_by).toBe('u-member-a');
  });

  it('answers a repeated key with 200 and the same single incident', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const send = () =>
      request(context.app)
        .post(`/api/match_reports/${id}/incidents`)
        .set(auth(ROUTE_TOKENS.owner_a))
        .send(INCIDENT);
    const first = await send();

    const second = await send();

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(second.body.data.report.incidents).toHaveLength(1);
  });

  it('answers 409 IDEMPOTENCY_KEY_CONFLICT for a key used on another report, without exposing it', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    await seed_game(context, 'g2', { home_team: 'Secret Rovers' });
    const first = await open_report(context, 'g1');
    const second = await open_report(context, 'g2');
    await request(context.app)
      .post(`/api/match_reports/${first}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ ...INCIDENT, notes: 'Other report private words' });

    const response = await request(context.app)
      .post(`/api/match_reports/${second}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(INCIDENT);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('IDEMPOTENCY_KEY_CONFLICT');
    expect(JSON.stringify(response.body)).not.toContain('Other report private words');
    expect(JSON.stringify(response.body)).not.toContain(first);
    expect((await context.match_reports.get_report('t1', second))?.incidents).toEqual([]);
  });

  it('answers 409 TOO_MANY_INCIDENTS for a 61st incident', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    for (let index = 0; index < 60; index++) {
      await request(context.app)
        .post(`/api/match_reports/${id}/incidents`)
        .set(auth(ROUTE_TOKENS.owner_a))
        .send({ ...INCIDENT, idempotency_key: `key-${String(index).padStart(8, '0')}` });
    }

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ ...INCIDENT, idempotency_key: 'key-one-too-many' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('TOO_MANY_INCIDENTS');
    expect((await context.match_reports.get_report('t1', id))?.incidents).toHaveLength(60);
  });

  it('answers 409 REPORT_NOT_EDITABLE for a ready report', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(INCIDENT);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPORT_NOT_EDITABLE');
  });

  it("answers 404 for another tenant's report", async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_b))
      .send(INCIDENT);

    expect(response.status).toBe(404);
    expect((await context.match_reports.get_report('t1', id))?.incidents).toEqual([]);
  });

  it.each([
    ['no team side', { team_side: undefined }, 'team_side'],
    ['a null team side', { team_side: null }, 'team_side'],
    ['an unknown team side', { team_side: 'BOTH' }, 'team_side'],
    ['no incident type', { incident_type: undefined }, 'incident_type'],
    ['an unknown incident type', { incident_type: 'BLUE' }, 'incident_type'],
    ['a short idempotency key', { idempotency_key: 'short' }, 'idempotency_key'],
    [
      'an idempotency key with bad characters',
      { idempotency_key: 'bad key!!!' },
      'idempotency_key',
    ],
    ['a jersey number of 100', { jersey_number: 100 }, 'jersey_number'],
    ['a minute of 131', { minute: 131 }, 'minute'],
    ['a long reason code', { reason_code: 'r'.repeat(65) }, 'reason_code'],
    ['notes over 500 characters', { notes: 'n'.repeat(501) }, 'notes'],
  ])('rejects %s with a 400 naming the field', async (_name, change, path) => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ ...INCIDENT, ...change });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.violations.map((v: { path: string }) => v.path)).toContain(path);
    expect((await context.match_reports.get_report('t1', id))?.incidents).toEqual([]);
  });

  it('rejects unknown fields such as a tenant id or audit actor', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ ...INCIDENT, tenant_id: 't2', created_by: 'someone' });

    expect(response.status).toBe(400);
  });

  it('never echoes the notes or numbers it was sent in an error', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ ...INCIDENT, jersey_number: 7777, notes: 'SECRET-NOTE'.repeat(100) });

    expect(response.status).toBe(400);
    expect(response.text).not.toContain('SECRET-NOTE');
    expect(response.text).not.toContain('7777');
  });
});

describe('DELETE /api/match_reports/:report_id/incidents/:incident_id', () => {
  /**
   * Adds a card and returns its id.
   * @param context The routes app under test.
   * @param report_id Report to add to.
   * @param key Idempotency key.
   * @returns The incident id.
   */
  async function add_card(context: IRoutesApp, report_id: string, key: string): Promise<string> {
    const response = await request(context.app)
      .post(`/api/match_reports/${report_id}/incidents`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ idempotency_key: key, team_side: 'HOME', incident_type: 'YELLOW' });
    return response.body.data.report.incidents.at(-1).incident_id as string;
  }

  it('removes the incident and returns the report', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const doomed = await add_card(context, id, 'key-aaaa0001');
    await add_card(context, id, 'key-aaaa0002');

    const response = await request(context.app)
      .delete(`/api/match_reports/${id}/incidents/${doomed}`)
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(
      response.body.data.report.incidents.map(
        (i: { idempotency_key: string }) => i.idempotency_key,
      ),
    ).toEqual(['key-aaaa0002']);
  });

  it('is idempotent: removing it again, or an unknown incident, answers 200 and changes nothing', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const doomed = await add_card(context, id, 'key-aaaa0001');
    const url = `/api/match_reports/${id}/incidents/${doomed}`;
    const first = await request(context.app).delete(url).set(auth(ROUTE_TOKENS.owner_a));

    const again = await request(context.app).delete(url).set(auth(ROUTE_TOKENS.owner_a));
    const unknown = await request(context.app)
      .delete(`/api/match_reports/${id}/incidents/ghost`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(again.status).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(first.body);
  });

  it('answers 409 REPORT_NOT_EDITABLE for an incident on a ready report', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    const incident_id = (await context.match_reports.get_report('t1', id))!.incidents[0]!
      .incident_id;
    await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));

    const response = await request(context.app)
      .delete(`/api/match_reports/${id}/incidents/${incident_id}`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('REPORT_NOT_EDITABLE');
  });

  it("answers 404 for another tenant's report and leaves the incident", async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    const incident_id = (await context.match_reports.get_report('t1', id))!.incidents[0]!
      .incident_id;

    const response = await request(context.app)
      .delete(`/api/match_reports/${id}/incidents/${incident_id}`)
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect((await context.match_reports.get_report('t1', id))?.incidents).toHaveLength(1);
  });

  it('answers 400 for a malformed incident id', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .delete(`/api/match_reports/${id}/incidents/${'x'.repeat(65)}`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
  });
});

describe('POST /api/match_reports/:report_id/ready and /reopen', () => {
  it('answers 422 REPORT_NOT_READY naming each blocker and leaves the report unchanged', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);
    const before = await context.match_reports.get_report('t1', id);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(422);
    expect(response.body.code).toBe('REPORT_NOT_READY');
    expect(response.body.violations).toEqual([
      { path: 'home_score', message: expect.any(String) },
      { path: 'away_score', message: expect.any(String) },
    ]);
    expect(await context.match_reports.get_report('t1', id)).toEqual(before);
    expect(context.audit.rows).toHaveLength(0);
  });

  it('marks a complete report READY and audits it without any notes', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.member_a));

    expect(response.status).toBe(200);
    expect(response.body.data.report.status).toBe('READY');
    expect(context.audit.rows).toHaveLength(1);
    const row = context.audit.rows[0]!;
    expect(row).toMatchObject({
      user_id: 'u-member-a',
      tenant_id: 't1',
      resource_type: 'match_report',
      resource_id: id,
      action: 'UPDATE',
      actual_role: 'TENANT_MEMBER',
      effective_role: 'TENANT_MEMBER',
    });
    expect(JSON.parse(String(row.after_state_json))).toEqual({
      report_id: id,
      game_id: 'g1',
      status: 'READY',
      home_score: 2,
      away_score: 1,
      incident_count: 1,
    });
    expect(JSON.stringify(context.audit.rows)).not.toContain('Secret match notes');
  });

  it('records the real and assumed role when a platform administrator marks a report ready', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER');

    expect(response.status).toBe(200);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_MEMBER',
    });
  });

  it('answers a second ready with 200 and writes no second audit row', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    const ready = () =>
      request(context.app).post(`/api/match_reports/${id}/ready`).set(auth(ROUTE_TOKENS.owner_a));
    const first = await ready();

    const second = await ready();

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    expect(context.audit.rows).toHaveLength(1);
  });

  it('reopens a ready report with an audit row, and it accepts edits again', async () => {
    const context = make_routes_app();
    const id = await make_complete_report(context);
    await request(context.app)
      .post(`/api/match_reports/${id}/ready`)
      .set(auth(ROUTE_TOKENS.owner_a));

    const reopened = await request(context.app)
      .post(`/api/match_reports/${id}/reopen`)
      .set(auth(ROUTE_TOKENS.owner_a));
    const edited = await request(context.app)
      .put(`/api/match_reports/${id}/scores`)
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({
        home_score: 7,
        away_score: 1,
        client_revision: reopened.body.data.report.client_revision,
      });

    expect(reopened.status).toBe(200);
    expect(reopened.body.data.report.status).toBe('DRAFT');
    expect(edited.body.data.report.home_score).toBe(7);
    expect(context.audit.rows).toHaveLength(2);
    expect(JSON.parse(String(context.audit.rows[1]!.after_state_json))).toMatchObject({
      status: 'DRAFT',
    });
  });

  it('answers reopening a draft with 200 and no audit row', async () => {
    const context = make_routes_app();
    await seed_game(context, 'g1');
    const id = await open_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/reopen`)
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body.data.report.status).toBe('DRAFT');
    expect(context.audit.rows).toHaveLength(0);
  });

  it.each(['ready', 'reopen'])(
    'answers 409 REPORT_NOT_EDITABLE to %s for a submitted report',
    async (action) => {
      const context = make_routes_app();
      const id = await make_complete_report(context);
      const report = (await context.match_reports.get_report('t1', id))!;
      await context.match_reports.apply_edit(
        't1',
        id,
        report.lock_version,
        make_contract_edit(report, { status: MatchReportStatus.SUBMITTED }),
        1,
        'system',
      );

      const response = await request(context.app)
        .post(`/api/match_reports/${id}/${action}`)
        .set(auth(ROUTE_TOKENS.owner_a));

      expect(response.status).toBe(409);
      expect(response.body.code).toBe('REPORT_NOT_EDITABLE');
    },
  );

  it.each(['ready', 'reopen'])("answers 404 to %s for another tenant's report", async (action) => {
    const context = make_routes_app();
    const id = await make_complete_report(context);

    const response = await request(context.app)
      .post(`/api/match_reports/${id}/${action}`)
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect(context.audit.rows).toHaveLength(0);
  });

  it('answers 500 without leaking the cause when the store fails', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = make_routes_app();
    context.match_reports.get_report = async () => {
      throw new Error('spanner exploded');
    };

    const response = await request(context.app)
      .post('/api/match_reports/r1/ready')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('spanner exploded');
    error_spy.mockRestore();
  });
});
