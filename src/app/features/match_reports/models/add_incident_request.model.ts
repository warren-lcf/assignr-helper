import { IncidentType } from '../enums/incident_type.enum';
import { TeamSide } from '../enums/team_side.enum';

/** The body of `POST /api/match_reports/:report_id/incidents`. */
export interface IAddIncidentRequest {
  /** 8 to 64 characters of letters, digits, `_` and `-`; replaying a key never adds a second incident. */
  idempotency_key: string;
  team_side: TeamSide;
  incident_type: IncidentType;
  jersey_number: number | null;
  minute: number | null;
  reason_code: string | null;
  notes: string | null;
}
