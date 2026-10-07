import { INormalizedGame } from '../../integrations/models/normalized_game.model.js';
import { SyncKind } from '../enums/sync_kind.enum.js';

/** Everything needed to merge one incoming game into the stored copy. */
export interface IMergeGameInput {
  /** `OPEN_GAMES` or `MY_GAMES`; decides which flag the incoming list may set. */
  kind: SyncKind;
  game: INormalizedGame;
  tenant_id: string;
  connection_id: string;
  organization_id: string;
  venue_id: string | null;
  local_date: number | null;
  fingerprint: string;
  run_id: string;
  /** Id used when the game is new. */
  new_game_id: string;
  actor: string;
  now: number;
}
