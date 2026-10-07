import { IGroupableGame } from './groupable_game.model.js';

/** One game as shown in the "games available" list and digest email. */
export interface IGameListItem extends IGroupableGame {
  organization_name: string;
  level: string | null;
  league: string | null;
  home_team: string | null;
  away_team: string | null;
  open_slot_count: number;
  /** Fee in minor currency units (for example cents), when known. */
  fee_minor: number | null;
  /** ISO 4217 currency code for `fee_minor`. */
  currency: string | null;
}
