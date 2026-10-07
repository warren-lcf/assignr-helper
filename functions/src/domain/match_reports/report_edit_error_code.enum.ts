/** Why an edit to a match report was refused. */
export enum ReportEditErrorCode {
  /** Only DRAFT reports accept changes. */
  REPORT_NOT_EDITABLE = 'REPORT_NOT_EDITABLE',
  INCIDENT_INVALID = 'INCIDENT_INVALID',
  /** A different incident already uses this `incident_id`. */
  DUPLICATE_INCIDENT_ID = 'DUPLICATE_INCIDENT_ID',
  INCIDENT_NOT_FOUND = 'INCIDENT_NOT_FOUND',
  SCORE_INVALID = 'SCORE_INVALID',
}
