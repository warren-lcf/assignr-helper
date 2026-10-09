/** The body of `PUT /api/match_reports/:report_id/scores`. */
export interface ISetScoresRequest {
  /** Final score 0 to 99; null clears it. */
  home_score: number | null;
  away_score: number | null;
  /** Left out to keep the notes the report has; null or blank clears them. This screen never edits notes, so it leaves them out. */
  notes?: string | null;
  /** Rises with every edit; the server ignores a request lower than the revision it holds. */
  client_revision: number;
}
