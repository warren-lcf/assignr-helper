import { IDigestLabels } from '../domain/email/digest_labels.model.js';

/** The opening paragraph used when a draft does not write its own. */
export const DEFAULT_DIGEST_INTRO =
  'These games still need officials. Open the live list to see what is available right now.';

/** The sender name printed in the footer when the settings name none. */
export const DEFAULT_DIGEST_SENDER_NAME = 'Your referee scheduler';

/**
 * Builds the wording of a "games available" email. The renderer holds no copy of its own, so
 * every sentence a recipient reads is here.
 * @param subject The draft's subject line, used as the email's subject.
 * @param intro The draft's opening paragraph, or null for the standard one.
 * @returns The labels for `render_games_digest`.
 */
export function make_digest_labels(subject: string, intro: string | null): IDigestLabels {
  return {
    locale: 'en-US',
    title: 'Games available',
    intro: intro ?? DEFAULT_DIGEST_INTRO,
    format_subject: () => subject,
    format_open_positions: (count) => (count === 1 ? '1 open position' : `${count} open positions`),
    view_live_list_label: 'View the live list',
    unsubscribe_line:
      'You are getting this email because you agreed to receive game availability updates.',
    unsubscribe_link_label: 'Unsubscribe',
    empty_state: 'No games are open right now.',
    versus_label: 'vs',
    team_tbd_label: 'TBD',
    unscheduled_date_label: 'Date to be announced',
    format_sent_by: (sender_name) => `Sent by ${sender_name}`,
    format_generated_at: (formatted_moment) => `Generated ${formatted_moment}`,
  };
}
