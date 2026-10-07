/** Reasons a report cannot yet be marked READY. */
export enum ReadyBlocker {
  HOME_SCORE_MISSING = 'HOME_SCORE_MISSING',
  HOME_SCORE_INVALID = 'HOME_SCORE_INVALID',
  AWAY_SCORE_MISSING = 'AWAY_SCORE_MISSING',
  AWAY_SCORE_INVALID = 'AWAY_SCORE_INVALID',
  /** At least one card has no team side. */
  CARD_MISSING_TEAM_SIDE = 'CARD_MISSING_TEAM_SIDE',
}
