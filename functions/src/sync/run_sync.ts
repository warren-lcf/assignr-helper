import { derive_local_date } from '../domain/time/derive_local_date.js';
import { INormalizedGame } from '../integrations/models/normalized_game.model.js';
import { MergeOutcome } from './enums/merge_outcome.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { fingerprint_game } from './fingerprint_game.js';
import { merge_stored_game } from './merge_stored_game.js';
import { ISyncCounts } from './models/sync_counts.model.js';
import { ISyncDeps } from './models/sync_deps.model.js';
import { ISyncRequest } from './models/sync_request.model.js';
import { ISyncRun } from './models/sync_run.model.js';
import { to_sync_run_error } from './to_sync_run_error.js';

/** A running row older than this is treated as abandoned and no longer blocks a new run. */
export const STALE_RUN_MS = 10 * 60_000;

const EMPTY_COUNTS: ISyncCounts = {
  seen_count: 0,
  created_count: 0,
  updated_count: 0,
  removed_count: 0,
};

/**
 * Runs one sync and records it. A failure is captured on the returned run (and
 * logged) rather than thrown, so a scheduler loop keeps going; nothing is marked
 * removed unless the pull completed. A run already in progress for the same
 * connection and kind makes this one a recorded no-op.
 * @param deps Injected dependencies.
 * @param request What to sync.
 * @returns The saved run, with status SUCCEEDED, FAILED or SKIPPED.
 */
export async function run_sync(deps: ISyncDeps, request: ISyncRequest): Promise<ISyncRun> {
  const started_at = deps.now();
  const base: ISyncRun = {
    tenant_id: request.tenant_id,
    run_id: deps.generate_id(),
    connection_id: request.connection_id,
    kind: request.kind,
    window_start: request.kind === SyncKind.REFERENCE_DATA ? null : request.window.start_at,
    window_end: request.kind === SyncKind.REFERENCE_DATA ? null : request.window.end_at,
    status: SyncRunStatus.RUNNING,
    started_at,
    finished_at: null,
    ...EMPTY_COUNTS,
    rate_limit_remaining: null,
    duration_ms: null,
    error: null,
    created_at: started_at,
    created_by: request.actor,
    updated_at: started_at,
    updated_by: request.actor,
  };

  const active = await deps.runs.find_active_run(
    request.tenant_id,
    request.connection_id,
    request.kind,
    started_at - STALE_RUN_MS,
  );
  if (active) {
    const skipped: ISyncRun = {
      ...base,
      status: SyncRunStatus.SKIPPED,
      finished_at: started_at,
      duration_ms: 0,
    };
    await deps.runs.save_run(skipped);
    return skipped;
  }

  await deps.runs.save_run(base);

  let finished: ISyncRun;
  try {
    const counts =
      request.kind === SyncKind.REFERENCE_DATA
        ? await sync_reference_data(deps, request)
        : await sync_games(deps, request, base.run_id);
    finished = { ...base, ...counts, status: SyncRunStatus.SUCCEEDED };
  } catch (error) {
    console.error('Sync run failed', request.connection_id, request.kind, error);
    finished = { ...base, status: SyncRunStatus.FAILED, error: to_sync_run_error(error) };
  }

  const finished_at = deps.now();
  finished = {
    ...finished,
    finished_at,
    duration_ms: finished_at - started_at,
    rate_limit_remaining: deps.rate_limit_remaining?.() ?? null,
    updated_at: finished_at,
  };
  await deps.runs.save_run(finished);
  return finished;
}

async function sync_reference_data(deps: ISyncDeps, request: ISyncRequest): Promise<ISyncCounts> {
  const incoming = await deps.provider.list_organizations(deps.ctx);
  const before = await deps.organizations.list_organizations(
    request.tenant_id,
    request.connection_id,
  );
  const known = new Set(before.map((organization) => organization.external_id));
  const now = deps.now();

  const stored = await deps.organizations.upsert_organizations(
    request.tenant_id,
    request.connection_id,
    incoming,
    request.actor,
    now,
  );

  const created = stored.filter((organization) => !known.has(organization.external_id));
  const updated = stored.filter(
    (organization) => known.has(organization.external_id) && organization.updated_at === now,
  );
  return {
    seen_count: incoming.length,
    created_count: created.length,
    updated_count: updated.length,
    removed_count: 0,
  };
}

async function sync_games(
  deps: ISyncDeps,
  request: ISyncRequest,
  run_id: string,
): Promise<ISyncCounts> {
  const is_open_run = request.kind === SyncKind.OPEN_GAMES;
  const listing = is_open_run
    ? await deps.provider.list_open_games(deps.ctx, request.window)
    : await deps.provider.list_my_games(deps.ctx, request.window);

  const by_external_id = new Map<string, INormalizedGame>();
  for (const game of listing.games) by_external_id.set(game.external_id, game);
  const games = [...by_external_id.values()];
  const now = deps.now();

  const organization_ids = await resolve_organizations(deps, request, games, now);
  const venue_ids = await resolve_venues(deps, request, games, now);
  const existing = await deps.games.find_by_external_ids(
    request.tenant_id,
    request.connection_id,
    games.map((game) => game.external_id),
  );
  const existing_by_external_id = new Map(existing.map((stored) => [stored.external_id, stored]));

  let created_count = 0;
  let updated_count = 0;
  const to_save = games.map((game) => {
    const merged = merge_stored_game(existing_by_external_id.get(game.external_id) ?? null, {
      kind: request.kind,
      game,
      tenant_id: request.tenant_id,
      connection_id: request.connection_id,
      organization_id: organization_ids.get(game.organization_external_id) as string,
      venue_id: game.venue ? (venue_ids.get(game.venue.external_id) ?? null) : null,
      local_date: derive_local_date(game.start_at, game.game_time_zone),
      fingerprint: fingerprint_game(game),
      run_id,
      new_game_id: deps.generate_id(),
      actor: request.actor,
      now,
    });
    if (merged.outcome === MergeOutcome.CREATED) created_count++;
    if (merged.outcome === MergeOutcome.UPDATED) updated_count++;
    return merged.game;
  });
  await deps.games.save_games(to_save);

  const removed_count = await apply_removals(
    deps,
    request,
    run_id,
    now,
    listing.complete_organization_external_ids,
    organization_ids,
  );
  return { seen_count: games.length, created_count, updated_count, removed_count };
}

/** Maps provider organization ids to stored ids, creating placeholders for unknown ones. */
async function resolve_organizations(
  deps: ISyncDeps,
  request: ISyncRequest,
  games: INormalizedGame[],
  now: number,
): Promise<Map<string, string>> {
  const stored = await deps.organizations.list_organizations(
    request.tenant_id,
    request.connection_id,
  );
  const ids = new Map(
    stored.map((organization) => [organization.external_id, organization.organization_id]),
  );

  const missing = [...new Set(games.map((game) => game.organization_external_id))].filter(
    (external_id) => !ids.has(external_id),
  );
  if (missing.length > 0) {
    const created = await deps.organizations.upsert_organizations(
      request.tenant_id,
      request.connection_id,
      missing.map((external_id) => ({ external_id, name: external_id, flags: {} })),
      request.actor,
      now,
    );
    for (const organization of created)
      ids.set(organization.external_id, organization.organization_id);
  }
  return ids;
}

/** Upserts the distinct venues of the games and maps provider venue ids to stored ids. */
async function resolve_venues(
  deps: ISyncDeps,
  request: ISyncRequest,
  games: INormalizedGame[],
  now: number,
): Promise<Map<string, string>> {
  const distinct = new Map<string, NonNullable<INormalizedGame['venue']>>();
  for (const game of games) {
    if (game.venue) distinct.set(game.venue.external_id, game.venue);
  }
  if (distinct.size === 0) return new Map();

  const stored = await deps.venues.upsert_venues(
    request.tenant_id,
    request.connection_id,
    [...distinct.values()],
    request.actor,
    now,
  );
  return new Map(stored.map((venue) => [venue.external_id, venue.venue_id]));
}

/**
 * Clears the flag this run owns on games it did not see, but only for
 * organizations that were read completely.
 */
async function apply_removals(
  deps: ISyncDeps,
  request: ISyncRequest,
  run_id: string,
  now: number,
  complete_external_ids: string[] | null,
  organization_ids: Map<string, string>,
): Promise<number> {
  let scope: string[] | null = null;
  if (complete_external_ids !== null) {
    scope = complete_external_ids
      .map((external_id) => organization_ids.get(external_id))
      .filter((id): id is string => id !== undefined);
    if (scope.length === 0) return 0;
  }

  const unseen = await deps.games.find_unseen({
    tenant_id: request.tenant_id,
    connection_id: request.connection_id,
    kind: request.kind,
    window_start: request.window.start_at,
    window_end: request.window.end_at,
    seen_run_id: run_id,
    organization_ids: scope,
  });

  const is_open_run = request.kind === SyncKind.OPEN_GAMES;
  const cleared = unseen.map((game) => {
    const is_open = is_open_run ? false : game.is_open;
    const is_mine = is_open_run ? game.is_mine : false;
    return {
      ...game,
      is_open,
      is_mine,
      removed_at: !is_open && !is_mine ? (game.removed_at ?? now) : null,
      updated_at: now,
      updated_by: request.actor,
    };
  });
  if (cleared.length > 0) await deps.games.save_games(cleared);
  return cleared.length;
}
