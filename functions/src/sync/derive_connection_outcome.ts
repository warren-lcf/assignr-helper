import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { ISyncOutcome } from '../connections/models/sync_outcome.model.js';
import { SyncRunStatus } from './enums/sync_run_status.enum.js';
import { ISyncRun } from './models/sync_run.model.js';

/** Failure names that mean the provider no longer accepts this connection's credentials. */
const REAUTH_ERROR_NAMES = new Set(['AssignrAuthError', 'ConnectionNotAuthorizedError']);

/**
 * Decides what a set of sync runs changes on its connection.
 * - Everything skipped (another sync was already running): no change.
 * - Any failure caused by rejected or missing credentials: the connection needs
 *   attention, so scheduled syncs stop until the owner reconnects.
 * - Any other failure: remember the message, keep the connection usable.
 * - Otherwise: a clean success, stamped with `now`.
 * @param runs Runs from one connection sync.
 * @param now UTC milliseconds of the attempt.
 * @returns The change to record, or null when nothing should change.
 */
export function derive_connection_outcome(runs: ISyncRun[], now: number): ISyncOutcome | null {
  const attempted = runs.filter((run) => run.status !== SyncRunStatus.SKIPPED);
  if (attempted.length === 0) return null;

  const failed = attempted.filter((run) => run.status === SyncRunStatus.FAILED);
  if (failed.length === 0) return { last_sync_at: now, last_error: null, status: null };

  const needs_reauth = failed.find((run) => run.error && REAUTH_ERROR_NAMES.has(run.error.name));
  if (needs_reauth) {
    return {
      last_sync_at: null,
      last_error: needs_reauth.error?.message ?? null,
      status: ConnectionStatus.NEEDS_ATTENTION,
    };
  }
  return { last_sync_at: null, last_error: failed[0].error?.message ?? null, status: null };
}
