import escape_html from 'escape-html';
import { IGameListItem } from '../games/game_list_item.model.js';
import { resolve_time_zone } from '../time/resolve_time_zone.js';
import { IDigestInput } from './digest_input.model.js';
import { IDigestLabels } from './digest_labels.model.js';
import { IRenderedDigest } from './rendered_digest.model.js';
import { format_digest_fee } from './format_digest_fee.js';
import { safe_https_url } from './safe_https_url.js';

const FONT_STACK = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const COLOR_TEXT = '#18181b';
const COLOR_MUTED = '#52525b';
const COLOR_BORDER = '#e4e4e7';
const COLOR_ACCENT = '#1d4ed8';

/** Display-ready pieces of one game row, still unescaped. */
interface IGameRowView {
  time: string;
  teams: string;
  details: string[];
}

/**
 * Collapses all whitespace (including newlines) so a value stays on one line.
 * @param value Raw text.
 * @returns Single-line text.
 */
function single_line(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Builds the display pieces for one game.
 * @param game The game.
 * @param labels Localised copy.
 * @param time_zone Resolved IANA zone for the start time.
 * @returns Unescaped display text for the row.
 */
function build_game_row_view(
  game: IGameListItem,
  labels: IDigestLabels,
  time_zone: string,
): IGameRowView {
  const time = new Intl.DateTimeFormat(labels.locale, {
    timeZone: time_zone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(game.start_at));
  const teams = [game.home_team ?? labels.team_tbd_label, game.away_team ?? labels.team_tbd_label]
    .map(single_line)
    .join(` ${labels.versus_label} `);
  const fee = format_digest_fee(game.fee_minor, game.currency, labels.locale);
  const details = [
    game.organization_name,
    game.level,
    game.league,
    labels.format_open_positions(game.open_slot_count),
    fee,
  ]
    .filter((part): part is string => part !== null)
    .map(single_line)
    .filter((part) => part.length > 0);

  return { time, teams, details };
}

/**
 * Formats a calendar-date heading from UTC-midnight milliseconds.
 * @param local_date UTC-midnight milliseconds, or null when unknown.
 * @param labels Localised copy.
 * @returns The heading text.
 */
function format_date_heading(local_date: number | null, labels: IDigestLabels): string {
  if (local_date === null) {
    return labels.unscheduled_date_label;
  }
  return new Intl.DateTimeFormat(labels.locale, {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(local_date));
}

/**
 * Formats the generation moment in the digest's time zone.
 * @param generated_at UTC milliseconds.
 * @param labels Localised copy.
 * @param time_zone Resolved IANA zone.
 * @returns Date and time text.
 */
function format_generated_moment(
  generated_at: number,
  labels: IDigestLabels,
  time_zone: string,
): string {
  return new Intl.DateTimeFormat(labels.locale, {
    timeZone: time_zone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(generated_at));
}

/**
 * Renders the HTML and plain-text bodies for the games-available digest.
 * @param input Digest data.
 * @param labels Localised copy; the renderer adds no user-facing text of its own.
 * @returns Subject, HTML and plain text. Every dynamic value in the HTML is
 *   escaped and only `https:` URLs are linked.
 */
export function render_games_digest(input: IDigestInput, labels: IDigestLabels): IRenderedDigest {
  const time_zone = resolve_time_zone(input.time_zone);
  const quick_link = safe_https_url(input.quick_link_url);
  const unsubscribe = safe_https_url(input.unsubscribe_url);
  const populated_groups = input.groups
    .map((group) => ({
      location_label: group.location_label,
      dates: group.dates.filter((date) => date.games.length > 0),
    }))
    .filter((group) => group.dates.length > 0);
  const game_count = populated_groups.reduce(
    (total, group) => total + group.dates.reduce((sum, date) => sum + date.games.length, 0),
    0,
  );
  const greeting = input.recipient_greeting === null ? null : single_line(input.recipient_greeting);
  const generated_note = labels.format_generated_at(
    format_generated_moment(input.generated_at, labels, time_zone),
  );
  const sent_by = labels.format_sent_by(single_line(input.sender_name));
  const subject = single_line(labels.format_subject(game_count));

  const html_parts: string[] = [];
  const text_lines: string[] = [labels.title, ''];

  html_parts.push(
    `<h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;color:${COLOR_TEXT};">${escape_html(labels.title)}</h1>`,
  );
  if (greeting !== null && greeting.length > 0) {
    html_parts.push(
      `<p style="margin:0 0 8px 0;font-size:16px;line-height:24px;color:${COLOR_TEXT};">${escape_html(greeting)}</p>`,
    );
    text_lines.push(greeting, '');
  }
  html_parts.push(
    `<p style="margin:0 0 20px 0;font-size:16px;line-height:24px;color:${COLOR_TEXT};">${escape_html(labels.intro)}</p>`,
  );
  text_lines.push(labels.intro, '');

  if (quick_link !== null) {
    html_parts.push(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;"><tr><td style="border-radius:6px;background-color:${COLOR_ACCENT};"><a href="${escape_html(quick_link)}" style="display:inline-block;padding:12px 20px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape_html(labels.view_live_list_label)}</a></td></tr></table>`,
    );
    text_lines.push(`${labels.view_live_list_label}: ${quick_link}`, '');
  }

  if (populated_groups.length === 0) {
    html_parts.push(
      `<p style="margin:0 0 24px 0;font-size:16px;line-height:24px;color:${COLOR_MUTED};">${escape_html(labels.empty_state)}</p>`,
    );
    text_lines.push(labels.empty_state, '');
  }

  for (const group of populated_groups) {
    const location = single_line(group.location_label);
    html_parts.push(
      `<h2 style="margin:24px 0 4px 0;font-size:18px;line-height:24px;color:${COLOR_TEXT};">${escape_html(location)}</h2>`,
    );
    text_lines.push(location.toUpperCase());

    for (const date of group.dates) {
      const heading = format_date_heading(date.local_date, labels);
      const rows_html: string[] = [];
      text_lines.push(`  ${heading}`);

      for (const game of date.games) {
        const view = build_game_row_view(game, labels, time_zone);
        const details_html =
          view.details.length > 0
            ? `<div style="margin-top:2px;font-size:13px;line-height:18px;color:${COLOR_MUTED};">${escape_html(view.details.join(' · '))}</div>`
            : '';
        rows_html.push(
          `<tr><td style="padding:8px 0;border-bottom:1px solid ${COLOR_BORDER};font-family:${FONT_STACK};"><div style="font-size:15px;line-height:22px;font-weight:bold;color:${COLOR_TEXT};">${escape_html(view.time)} &ndash; ${escape_html(view.teams)}</div>${details_html}</td></tr>`,
        );
        text_lines.push(`    - ${view.time} - ${view.teams}`);
        if (view.details.length > 0) {
          text_lines.push(`      ${view.details.join(' · ')}`);
        }
      }

      html_parts.push(
        `<h3 style="margin:12px 0 0 0;font-size:14px;line-height:20px;color:${COLOR_MUTED};">${escape_html(heading)}</h3>`,
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows_html.join('')}</table>`,
      );
      text_lines.push('');
    }
  }

  const footer_html = [
    `<p style="margin:0 0 4px 0;font-size:13px;line-height:18px;color:${COLOR_MUTED};">${escape_html(sent_by)}</p>`,
    `<p style="margin:0 0 12px 0;font-size:13px;line-height:18px;color:${COLOR_MUTED};">${escape_html(generated_note)}</p>`,
    `<p style="margin:0;font-size:13px;line-height:18px;color:${COLOR_MUTED};">${escape_html(labels.unsubscribe_line)}${
      unsubscribe === null
        ? ''
        : ` <a href="${escape_html(unsubscribe)}" style="color:${COLOR_MUTED};text-decoration:underline;">${escape_html(labels.unsubscribe_link_label)}</a>`
    }</p>`,
  ].join('');
  text_lines.push('--', sent_by, generated_note, labels.unsubscribe_line);
  if (unsubscribe !== null) {
    text_lines.push(`${labels.unsubscribe_link_label}: ${unsubscribe}`);
  }

  const html = [
    '<!DOCTYPE html>',
    `<html lang="${escape_html(labels.locale)}">`,
    '<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escape_html(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:${FONT_STACK};">`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;"><tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:8px;"><tr><td style="padding:24px;font-family:${FONT_STACK};">`,
    html_parts.join(''),
    `<hr style="margin:24px 0 16px 0;border:0;border-top:1px solid ${COLOR_BORDER};">`,
    footer_html,
    '</td></tr></table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');

  return { subject, html, text: text_lines.join('\n') };
}
