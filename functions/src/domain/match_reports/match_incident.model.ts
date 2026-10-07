import { IncidentType } from './incident_type.enum.js';
import { TeamSide } from './team_side.enum.js';

/** One incident (usually a card) recorded against a match. */
export interface IMatchIncident {
  incident_id: string;
  /** Client-generated key that makes retried submissions harmless. */
  idempotency_key: string;
  /** Null only while the side is unknown; cards need a side before the report is ready. */
  team_side: TeamSide | null;
  jersey_number: number | null;
  incident_type: IncidentType;
  minute: number | null;
  reason_code: string | null;
  notes: string | null;
}
