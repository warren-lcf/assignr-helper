import { IMatchIncident } from '../../domain/match_reports/match_incident.model.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';

/**
 * An incident as stored. The domain model allows a null team side while it is unknown, but the
 * `match_report_incidents.team_side` column is NOT NULL and the API always asks for the side, so a
 * stored incident always has one. The stores refuse to write anything else.
 */
export interface IStoredMatchIncident extends IMatchIncident, IAuditStamp {
  team_side: TeamSide;
}
