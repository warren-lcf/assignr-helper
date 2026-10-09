/** One thing that stops a report being marked ready, in words the referee can act on. */
export interface IReportBlocker {
  /** The API's field path, such as `home_score` or `incidents[abc].team_side`. */
  path: string;
  /** Translated sentence naming the field and what is wrong. */
  message: string;
}
