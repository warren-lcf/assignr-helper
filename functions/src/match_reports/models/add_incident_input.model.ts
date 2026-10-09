import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';

/** A validated request to record an incident, with every default resolved. */
export interface IAddIncidentInput {
  /** Client-generated key that makes a retried request harmless. */
  idempotency_key: string;
  /** Which team the incident is about; always present. */
  team_side: TeamSide;
  incident_type: IncidentType;
  jersey_number: number | null;
  minute: number | null;
  reason_code: string | null;
  notes: string | null;
}
