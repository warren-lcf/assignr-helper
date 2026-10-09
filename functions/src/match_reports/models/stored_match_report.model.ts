import { IMatchReport } from '../../domain/match_reports/match_report.model.js';
import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';
import { IStoredMatchIncident } from './stored_match_incident.model.js';

/** A match report as stored: the domain report plus its tenant, audit stamps and stamped incidents. */
export interface IStoredMatchReport extends IMatchReport, IAuditStamp {
  tenant_id: string;
  /** Oldest first (`created_at`, then `incident_id`). */
  incidents: IStoredMatchIncident[];
}
