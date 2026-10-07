/**
 * Every user-facing string used by the digest renderer, so the renderer holds
 * no hard-coded copy and can be localised by the caller.
 */
export interface IDigestLabels {
  /** BCP 47 locale used for date, time and currency formatting, e.g. `en-US`. */
  locale: string;
  title: string;
  intro: string;
  /** Builds the email subject line from the total number of games listed. */
  format_subject: (game_count: number) => string;
  /** Pluralises the open-position count, e.g. `1 open position` / `3 open positions`. */
  format_open_positions: (count: number) => string;
  view_live_list_label: string;
  /** Sentence explaining why the recipient got this email. */
  unsubscribe_line: string;
  /** Text of the unsubscribe link. */
  unsubscribe_link_label: string;
  empty_state: string;
  /** Separator between team names, e.g. `vs`. */
  versus_label: string;
  /** Placeholder for a missing team name. */
  team_tbd_label: string;
  /** Heading for games whose date is unknown. */
  unscheduled_date_label: string;
  /** Builds the sign-off from the sender name. */
  format_sent_by: (sender_name: string) => string;
  /** Builds the generated-at note from an already formatted date and time. */
  format_generated_at: (formatted_moment: string) => string;
}
