import { z } from 'zod';

/** Largest page of sync history a caller may ask for. */
export const MAX_SYNC_RUNS_LIMIT = 100;

/** Default page of sync history. */
export const DEFAULT_SYNC_RUNS_LIMIT = 20;

/** Query string of `GET /connections/:connection_id/sync-runs`. */
export const sync_runs_query_schema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(MAX_SYNC_RUNS_LIMIT).default(DEFAULT_SYNC_RUNS_LIMIT),
});
