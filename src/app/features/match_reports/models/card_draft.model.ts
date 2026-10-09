import { IncidentType } from '../enums/incident_type.enum';
import { ReasonCode } from '../enums/reason_code.enum';
import { TeamSide } from '../enums/team_side.enum';

/** A card being put together in the "Add a card" panel. */
export interface ICardDraft {
  team_side: TeamSide | null;
  incident_type: IncidentType | null;
  /** The digits typed on the keypad ("" when none). */
  jersey_digits: string;
  /** True once "No number" was pressed; typing a digit clears it. */
  no_number: boolean;
  /** The minute the referee chose; null while the default (minutes since kick-off) still applies. */
  minute: number | null;
  reason_code: ReasonCode | null;
}
