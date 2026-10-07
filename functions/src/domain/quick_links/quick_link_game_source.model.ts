import { GameStatus } from '../../integrations/enums/game_status.enum.js';

/**
 * A game as held internally, before it is reduced for a quick link. This is a
 * superset of the public shape and includes fields that must never leave the
 * server (assignees, external ids, raw payload, organization name).
 */
export interface IQuickLinkGameSource {
  game_id: string;
  external_id: string;
  organization_id: string;
  organization_name: string;
  status: GameStatus;
  /** True while at least one slot is unfilled and the game can be claimed. */
  is_open: boolean;
  start_at: number;
  local_date: number | null;
  venue_name: string | null;
  location_group: string | null;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  fee_minor: number | null;
  currency: string | null;
  /** Names of officials already assigned. Private. */
  assignee_names: string[];
  /** Untouched provider payload. Private. */
  raw_json: string | null;
}
