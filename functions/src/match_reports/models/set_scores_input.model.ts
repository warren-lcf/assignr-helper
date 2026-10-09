/** A validated request to set a report's scores. */
export interface ISetScoresInput {
  home_score: number | null;
  away_score: number | null;
  /** The new report notes; undefined leaves the notes as they are, null clears them. */
  notes: string | null | undefined;
  /** The revision the client based this edit on; an edit older than the stored one is ignored. */
  client_revision: number;
}
