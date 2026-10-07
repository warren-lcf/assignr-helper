import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IAuditStamp } from './audit_stamp.model.js';
import { IStoredGameSlot } from './stored_game_slot.model.js';

/** A game as stored in our independent copy. */
export interface IStoredGame extends IAuditStamp {
  tenant_id: string;
  game_id: string;
  connection_id: string;
  organization_id: string;
  external_id: string;
  venue_id: string | null;
  start_at: number;
  end_at: number | null;
  game_time_zone: string | null;
  /** UTC-midnight milliseconds of the venue-local calendar date, for grouping. */
  local_date: number | null;
  status: GameStatus;
  published: boolean;
  league: string | null;
  age_group: string | null;
  level: string | null;
  game_type: string | null;
  gender: string | null;
  home_team: string | null;
  away_team: string | null;
  /** True while the game was last seen on an open-games list. */
  is_open: boolean;
  /** True while the game was last seen on the account's own list. */
  is_mine: boolean;
  external_updated_at: number | null;
  lock_version: number | null;
  /** Hash of the content that identifies a real change. */
  fingerprint: string;
  last_seen_sync_run_id: string;
  /** Set when the game is neither open nor mine any more; cleared if it reappears. */
  removed_at: number | null;
  raw: Record<string, unknown>;
  slots: IStoredGameSlot[];
}
