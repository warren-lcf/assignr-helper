/** Problems the preview reports about a draft. Mirrors the backend codes. */
export enum PreviewWarningCode {
  /** No sender (SendGrid) settings are saved. Blocks sending. */
  EMAIL_NOT_CONFIGURED = 'email_not_configured',
  /** No open game matches the draft filters. Blocks sending. */
  NO_GAMES = 'no_games',
  /** Nobody would receive the email. Blocks sending. */
  NO_RECIPIENTS = 'no_recipients',
  /** More people than one send allows. Blocks sending. */
  TOO_MANY_RECIPIENTS = 'too_many_recipients',
  /** The sender has no postal address. Advisory only. */
  NO_POSTAL_ADDRESS = 'no_postal_address',
}
