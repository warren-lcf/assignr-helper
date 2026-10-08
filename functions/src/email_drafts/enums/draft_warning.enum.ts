/** Things the owner should know about a draft before sending it. The values are the wire codes. */
export enum DraftWarning {
  EMAIL_NOT_CONFIGURED = 'email_not_configured',
  NO_GAMES = 'no_games',
  NO_RECIPIENTS = 'no_recipients',
  TOO_MANY_RECIPIENTS = 'too_many_recipients',
  NO_POSTAL_ADDRESS = 'no_postal_address',
  /** More games matched than one email lists, so only the soonest are shown. */
  GAMES_TRUNCATED = 'games_truncated',
}
