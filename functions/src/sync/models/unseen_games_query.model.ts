import { SyncKind } from '../enums/sync_kind.enum.js';

/**
 * Selects stored games a completed run did not see: flagged open (for an
 * open-games run) or mine (for a my-games run), inside the window, and last seen
 * by an earlier run.
 */
export interface IUnseenGamesQuery {
  tenant_id: string;
  connection_id: string;
  /** `OPEN_GAMES` selects `is_open` rows; `MY_GAMES` selects `is_mine` rows. */
  kind: SyncKind;
  window_start: number;
  window_end: number;
  seen_run_id: string;
  /** Restrict to these organizations; null means all. */
  organization_ids: string[] | null;
}
