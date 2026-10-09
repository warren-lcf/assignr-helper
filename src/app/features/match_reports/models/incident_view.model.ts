import { IncidentType } from '../enums/incident_type.enum';
import { TeamSide } from '../enums/team_side.enum';

/** One recorded incident (a card) as the API returns it. Mirrors the backend. */
export interface IIncidentView {
  incident_id: string;
  /** The key the client chose when adding it; the same key replayed never adds a second incident. */
  idempotency_key: string;
  team_side: TeamSide;
  /** Player number 0 to 99; null when unknown. */
  jersey_number: number | null;
  incident_type: IncidentType;
  /** Minute of the match, 0 to 130; null when unknown. */
  minute: number | null;
  /** A stable `ReasonCode` value, or null. */
  reason_code: string | null;
  notes: string | null;
}
