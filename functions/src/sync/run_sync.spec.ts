import { describe, expect, it, vi } from 'vitest';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { ISyncRun } from './models/sync_run.model.js';
import { make_normalized_game } from './make_normalized_game.fixture.js';
import { make_sync_harness, make_sync_request } from './make_sync_harness.fixture.js';
import { run_sync } from './run_sync.js';

const organizations = [
  { external_id: '101', name: 'Metro Youth Soccer Assignor', flags: { show_all_games: true } },
  { external_id: '202', name: 'County Rec League', flags: {} },
];

describe('run_sync: reference data', () => {
  it('stores organizations and counts created, then updated rows', async () => {
    const harness = make_sync_harness();
    harness.provider.organizations = organizations;

    const first = await run_sync(harness.deps, make_sync_request(SyncKind.REFERENCE_DATA));
    harness.provider.organizations = [
      { ...organizations[0], name: 'Metro Youth Soccer' },
      organizations[1],
    ];
    const second = await run_sync(harness.deps, make_sync_request(SyncKind.REFERENCE_DATA));

    expect(first).toMatchObject({
      status: SyncRunStatus.SUCCEEDED,
      seen_count: 2,
      created_count: 2,
      updated_count: 0,
      window_start: null,
      window_end: null,
    });
    expect(second).toMatchObject({ seen_count: 2, created_count: 0, updated_count: 1 });
    const stored = await harness.organizations.list_organizations('t1', 'c1');
    expect(stored.map((organization) => organization.name).sort()).toEqual([
      'County Rec League',
      'Metro Youth Soccer',
    ]);
  });
});

describe('run_sync: open games', () => {
  it('creates games with venue, local date and a placeholder organization', async () => {
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [make_normalized_game()],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run).toMatchObject({
      status: SyncRunStatus.SUCCEEDED,
      seen_count: 1,
      created_count: 1,
      updated_count: 0,
      removed_count: 0,
      rate_limit_remaining: 42,
      error: null,
      created_by: 'system:sync',
    });
    expect(run.duration_ms).toBeGreaterThan(0);
    const [game] = harness.games.all_games();
    expect(game).toMatchObject({
      tenant_id: 't1',
      external_id: '5001',
      is_open: true,
      is_mine: false,
      local_date: Date.UTC(2026, 9, 11),
      last_seen_sync_run_id: run.run_id,
    });
    expect(game.venue_id).not.toBeNull();
    const [organization] = await harness.organizations.list_organizations('t1', 'c1');
    expect(organization.name).toBe('101');
    expect(game.organization_id).toBe(organization.organization_id);
  });

  it('records each run in the history, newest first', async () => {
    const harness = make_sync_harness();

    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));
    const second = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    const history = await harness.runs.list_runs('t1', 'c1', 10);
    expect(history).toHaveLength(2);
    expect(history[0].run_id).toBe(second.run_id);
  });

  it('reports a re-sighting as neither created nor updated', async () => {
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [make_normalized_game()],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));
    const second = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(second).toMatchObject({
      seen_count: 1,
      created_count: 0,
      updated_count: 0,
      removed_count: 0,
    });
    expect(harness.games.all_games()[0].last_seen_sync_run_id).toBe(second.run_id);
  });

  it('counts a changed slot as an update', async () => {
    const harness = make_sync_harness();
    const open = make_normalized_game();
    harness.provider.open_result = {
      games: [open],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    harness.provider.open_result = {
      games: [
        {
          ...open,
          slots: [
            {
              ...open.slots[0],
              assignee_name: 'Sam Linesman',
              assignment_external_id: '8001',
              response_status: AssignmentResponseStatus.ACCEPTED,
            },
          ],
        },
      ],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    const second = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(second.updated_count).toBe(1);
    expect(harness.games.all_games()[0].slots[0].assignee_name).toBe('Sam Linesman');
  });

  it('keeps one copy when a listing repeats a game', async () => {
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [
        make_normalized_game({ home_team: 'Old' }),
        make_normalized_game({ home_team: 'New' }),
      ],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.seen_count).toBe(1);
    expect(harness.games.all_games()[0].home_team).toBe('New');
  });

  it('stores a game without a venue', async () => {
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [make_normalized_game({ venue: null })],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(harness.games.all_games()[0].venue_id).toBeNull();
  });
});

describe('run_sync: removals', () => {
  async function seed_open_game(harness: ReturnType<typeof make_sync_harness>) {
    harness.provider.open_result = {
      games: [make_normalized_game()],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));
  }

  it('marks a game no longer open when it drops off a complete listing', async () => {
    const harness = make_sync_harness();
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.removed_count).toBe(1);
    expect(harness.games.all_games()[0]).toMatchObject({ is_open: false, is_mine: false });
    expect(harness.games.all_games()[0].removed_at).not.toBeNull();
  });

  it('keeps removed_at empty when the dropped game is still mine', async () => {
    const harness = make_sync_harness();
    harness.provider.my_result = {
      games: [make_normalized_game({ is_open: false, is_mine: true })],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.MY_GAMES));
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(harness.games.all_games()[0]).toMatchObject({
      is_open: false,
      is_mine: true,
      removed_at: null,
    });
  });

  it('clears is_mine when a game leaves my list, and removes it if nothing else holds it', async () => {
    const harness = make_sync_harness();
    harness.provider.my_result = {
      games: [make_normalized_game({ is_open: false, is_mine: true })],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.MY_GAMES));
    expect(harness.games.all_games()[0]).toMatchObject({ is_mine: true, removed_at: null });

    harness.provider.my_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    const run = await run_sync(harness.deps, make_sync_request(SyncKind.MY_GAMES));

    expect(run.removed_count).toBe(1);
    expect(harness.games.all_games()[0].is_mine).toBe(false);
    expect(harness.games.all_games()[0].removed_at).not.toBeNull();
  });

  it('removes nothing when no organization was read completely', async () => {
    const harness = make_sync_harness();
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 3,
      complete_organization_external_ids: [],
    };

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.status).toBe(SyncRunStatus.SUCCEEDED);
    expect(run.removed_count).toBe(0);
    expect(harness.games.all_games()[0].is_open).toBe(true);
  });

  it('removes only games of organizations that were read completely', async () => {
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [
        make_normalized_game({ external_id: '1', organization_external_id: '101' }),
        make_normalized_game({ external_id: '2', organization_external_id: '202' }),
      ],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    harness.provider.open_result = {
      games: [],
      skipped_count: 1,
      complete_organization_external_ids: ['101'],
    };
    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.removed_count).toBe(1);
    const by_external_id = new Map(
      harness.games.all_games().map((game) => [game.external_id, game]),
    );
    expect(by_external_id.get('1')?.is_open).toBe(false);
    expect(by_external_id.get('2')?.is_open).toBe(true);
  });

  it('ignores a completeness list naming an unknown organization', async () => {
    const harness = make_sync_harness();
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: ['999'],
    };

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.removed_count).toBe(0);
  });

  it('leaves games outside the window alone', async () => {
    const harness = make_sync_harness();
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };

    const run = await run_sync(
      harness.deps,
      make_sync_request(SyncKind.OPEN_GAMES, {
        window: { start_at: Date.UTC(2026, 10, 1), end_at: Date.UTC(2026, 10, 30) },
      }),
    );

    expect(run.removed_count).toBe(0);
    expect(harness.games.all_games()[0].is_open).toBe(true);
  });

  it('brings a removed game back when it reappears', async () => {
    const harness = make_sync_harness();
    await seed_open_game(harness);
    harness.provider.open_result = {
      games: [],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));
    expect(harness.games.all_games()[0].removed_at).not.toBeNull();

    await seed_open_game(harness);

    expect(harness.games.all_games()[0]).toMatchObject({ is_open: true, removed_at: null });
  });
});

describe('run_sync: failure and concurrency', () => {
  it('records a failed run, logs the real error, and removes nothing', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const harness = make_sync_harness();
    harness.provider.open_result = {
      games: [make_normalized_game()],
      skipped_count: 0,
      complete_organization_external_ids: null,
    };
    await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));
    harness.provider.failure = new AssignrApiError('Assignr API 500', 500, { token: 'secret' });

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run).toMatchObject({
      status: SyncRunStatus.FAILED,
      removed_count: 0,
      error: { name: 'AssignrApiError', message: 'Assignr API 500', status: 500 },
    });
    expect(JSON.stringify(run)).not.toContain('secret');
    expect(error_spy).toHaveBeenCalledWith(
      'Sync run failed',
      'c1',
      SyncKind.OPEN_GAMES,
      expect.any(AssignrApiError),
    );
    expect(harness.games.all_games()[0].is_open).toBe(true);
    const saved = await harness.runs.list_runs('t1', 'c1', 10);
    expect(saved[0].status).toBe(SyncRunStatus.FAILED);
    error_spy.mockRestore();
  });

  function running_run(harness: ReturnType<typeof make_sync_harness>, age_ms: number): ISyncRun {
    const started_at = harness.clock() - age_ms;
    return {
      tenant_id: 't1',
      run_id: 'other',
      connection_id: 'c1',
      kind: SyncKind.OPEN_GAMES,
      window_start: 0,
      window_end: 1,
      status: SyncRunStatus.RUNNING,
      started_at,
      finished_at: null,
      seen_count: 0,
      created_count: 0,
      updated_count: 0,
      removed_count: 0,
      rate_limit_remaining: null,
      duration_ms: null,
      error: null,
      created_at: started_at,
      created_by: 'system:sync',
      updated_at: started_at,
      updated_by: 'system:sync',
    };
  }

  it('skips and records a run when another is already in progress', async () => {
    const harness = make_sync_harness();
    await harness.runs.save_run(running_run(harness, 60_000));

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run).toMatchObject({ status: SyncRunStatus.SKIPPED, duration_ms: 0 });
    expect(harness.provider.calls).toEqual([]);
  });

  it('proceeds when the in-progress run is stale', async () => {
    const harness = make_sync_harness();
    await harness.runs.save_run(running_run(harness, 11 * 60_000));

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.status).toBe(SyncRunStatus.SUCCEEDED);
    expect(harness.provider.calls).toEqual(['list_open_games']);
  });

  it('does not let a running sync of another kind block this one', async () => {
    const harness = make_sync_harness();
    await harness.runs.save_run({ ...running_run(harness, 1000), kind: SyncKind.MY_GAMES });

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.OPEN_GAMES));

    expect(run.status).toBe(SyncRunStatus.SUCCEEDED);
  });

  it('reports no rate-limit value when the provider gives none', async () => {
    const harness = make_sync_harness();
    harness.deps.rate_limit_remaining = undefined;

    const run = await run_sync(harness.deps, make_sync_request(SyncKind.MY_GAMES));

    expect(run.rate_limit_remaining).toBeNull();
  });
});
