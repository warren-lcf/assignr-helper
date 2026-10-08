import { describe, expect, it } from 'vitest';
import { IGameListItem } from '../games/game_list_item.model.js';
import { group_games } from '../games/group_games.js';
import { IDigestInput } from './digest_input.model.js';
import { IDigestLabels } from './digest_labels.model.js';
import { render_games_digest } from './render_games_digest.js';

const LABELS: IDigestLabels = {
  locale: 'en-US',
  title: 'Games available',
  intro: 'These games still need officials.',
  format_subject: (game_count) => `${game_count} games need referees`,
  format_open_positions: (count) => (count === 1 ? '1 open position' : `${count} open positions`),
  view_live_list_label: 'View live list',
  unsubscribe_line: 'You get this because you opted in.',
  unsubscribe_link_label: 'Unsubscribe',
  empty_state: 'No games are open right now.',
  versus_label: 'vs',
  team_tbd_label: 'TBD',
  unscheduled_date_label: 'Date to be announced',
  format_sent_by: (sender_name) => `Sent by ${sender_name}`,
  format_generated_at: (moment) => `Generated ${moment}`,
};

const GAME_START = Date.UTC(2026, 5, 16, 23, 0); // 7:00 PM EDT on June 16

function make_game(overrides: Partial<IGameListItem> = {}): IGameListItem {
  return {
    game_id: 'g1',
    organization_name: 'City League',
    venue_name: 'Field A',
    location_group: null,
    local_date: Date.UTC(2026, 5, 16),
    start_at: GAME_START,
    level: 'U12',
    league: 'Spring',
    home_team: 'Hawks',
    away_team: 'Eagles',
    open_slot_count: 2,
    fee_minor: 5000,
    currency: 'USD',
    ...overrides,
  };
}

function make_input(games: IGameListItem[], overrides: Partial<IDigestInput> = {}): IDigestInput {
  return {
    recipient_greeting: 'Hi Sam,',
    groups: group_games(games),
    quick_link_url: 'https://app.example.com/q/token123',
    unsubscribe_url: 'https://app.example.com/unsubscribe/abc',
    sender_name: 'Dana Lee',
    generated_at: GAME_START,
    time_zone: 'America/New_York',
    ...overrides,
  };
}

describe('render_games_digest', () => {
  it('renders subject, html and text for a normal digest', () => {
    const result = render_games_digest(make_input([make_game()]), LABELS);

    expect(result.subject).toBe('1 games need referees');
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<html lang="en-US">');
    expect(result.html).toContain('Games available');
    expect(result.html).toContain('Hi Sam,');
    expect(result.html).toContain('Field A');
    expect(result.html).toContain('Tuesday, June 16, 2026');
    expect(result.html).toMatch(/7:00\s?PM EDT/);
    expect(result.html).toContain('Hawks vs Eagles');
    expect(result.html).toContain('City League · U12 · Spring · 2 open positions · $50.00');
    expect(result.html).toContain('href="https://app.example.com/q/token123"');
    expect(result.html).toContain('href="https://app.example.com/unsubscribe/abc"');
    expect(result.html).toContain('Sent by Dana Lee');
    expect(result.html).toContain('<table role="presentation"');

    expect(result.text).toContain('Games available');
    expect(result.text).toContain('Hi Sam,');
    expect(result.text).toContain('FIELD A');
    expect(result.text).toContain('Tuesday, June 16, 2026');
    expect(result.text).toMatch(/- 7:00\s?PM EDT - Hawks vs Eagles/);
    expect(result.text).toContain('View live list: https://app.example.com/q/token123');
    expect(result.text).toContain('Unsubscribe: https://app.example.com/unsubscribe/abc');
    expect(result.text).toContain('Sent by Dana Lee');
    expect(result.text).not.toContain('<');
  });

  it('uses singular and plural open-position labels', () => {
    const result = render_games_digest(
      make_input([
        make_game({ game_id: 'a', open_slot_count: 1, start_at: GAME_START }),
        make_game({ game_id: 'b', open_slot_count: 3, start_at: GAME_START + 1 }),
      ]),
      LABELS,
    );

    expect(result.html).toContain('1 open position');
    expect(result.html).not.toContain('1 open positions');
    expect(result.html).toContain('3 open positions');
    expect(result.subject).toBe('2 games need referees');
  });

  it('escapes every dynamic value against HTML injection', () => {
    const xss = '<script>alert("x")</script>';
    const result = render_games_digest(
      make_input(
        [
          make_game({
            home_team: xss,
            away_team: `Bob's "Team" & <b>Co</b>`,
            venue_name: xss,
            organization_name: '<img src=x onerror=alert(1)>',
            level: '<u>U12</u>',
            league: '"><svg onload=alert(1)>',
            currency: '<b>',
          }),
        ],
        {
          recipient_greeting: '<i>Sam</i>',
          sender_name: '<script>evil()</script>',
        },
      ),
      LABELS,
    );

    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img');
    expect(result.html).not.toContain('<svg');
    expect(result.html).not.toContain('<b>');
    expect(result.html).not.toContain('<i>Sam');
    expect(result.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(result.html).toContain('Bob&#39;s &quot;Team&quot; &amp; &lt;b&gt;Co&lt;/b&gt;');
    expect(result.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(result.html).toContain('&lt;i&gt;Sam&lt;/i&gt;');
    expect(result.html).toContain('Sent by &lt;script&gt;evil()&lt;/script&gt;');
  });

  it('escapes quotes in URLs so an href cannot be broken out of', () => {
    const result = render_games_digest(
      make_input([make_game()], {
        quick_link_url: 'https://example.com/?a="onmouseover="alert(1)',
      }),
      LABELS,
    );

    expect(result.html).not.toContain('"onmouseover=');
    expect(result.html).toContain('href="https://example.com/?a=%22onmouseover=%22alert(1)"');
  });

  it('omits the quick link for javascript: and non-https URLs', () => {
    for (const bad of ['javascript:alert(1)', 'http://example.com', 'data:text/html,hi', '']) {
      const result = render_games_digest(
        make_input([make_game()], { quick_link_url: bad }),
        LABELS,
      );
      expect(result.html).not.toContain(bad || 'zzz-never');
      expect(result.html).not.toContain('View live list');
      expect(result.text).not.toContain('View live list');
    }
  });

  it('omits the quick link when it is null', () => {
    const result = render_games_digest(make_input([make_game()], { quick_link_url: null }), LABELS);

    expect(result.html).not.toContain('View live list');
  });

  it('omits an unsafe unsubscribe link but keeps the explanatory line', () => {
    const result = render_games_digest(
      make_input([make_game()], { unsubscribe_url: 'javascript:alert(1)' }),
      LABELS,
    );

    expect(result.html).not.toContain('javascript:');
    expect(result.html).not.toContain('Unsubscribe</a>');
    expect(result.html).toContain('You get this because you opted in.');
    expect(result.text).not.toContain('Unsubscribe:');
    expect(result.text).toContain('You get this because you opted in.');
  });

  it('renders the empty state when there are no groups', () => {
    const result = render_games_digest(make_input([]), LABELS);

    expect(result.subject).toBe('0 games need referees');
    expect(result.html).toContain('No games are open right now.');
    expect(result.text).toContain('No games are open right now.');
    expect(result.html).toContain('Unsubscribe');
  });

  it('treats groups whose dates have no games as empty', () => {
    const result = render_games_digest(
      make_input([], {
        groups: [{ location_label: 'Ghost Park', dates: [{ local_date: null, games: [] }] }],
      }),
      LABELS,
    );

    expect(result.html).not.toContain('Ghost Park');
    expect(result.html).toContain('No games are open right now.');
  });

  it('preserves the given order of locations, dates and games', () => {
    const games = [
      make_game({
        game_id: '1',
        venue_name: 'Alpha Park',
        local_date: Date.UTC(2026, 5, 17),
        home_team: 'T1',
      }),
      make_game({
        game_id: '2',
        venue_name: 'Alpha Park',
        local_date: Date.UTC(2026, 5, 16),
        home_team: 'T2',
      }),
      make_game({
        game_id: '3',
        venue_name: 'Beta Park',
        local_date: Date.UTC(2026, 5, 16),
        home_team: 'T3',
      }),
    ];
    const result = render_games_digest(make_input(games), LABELS);
    const order = [
      'Alpha Park',
      'Tuesday, June 16',
      'T2',
      'Wednesday, June 17',
      'T1',
      'Beta Park',
      'T3',
    ].map((needle) => result.html.indexOf(needle));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);

    const reversed_groups = group_games(games).reverse();
    const reversed = render_games_digest(make_input([], { groups: reversed_groups }), LABELS);
    expect(reversed.html.indexOf('Beta Park')).toBeLessThan(reversed.html.indexOf('Alpha Park'));
  });

  it('renders start times in the supplied time zone', () => {
    const pacific = render_games_digest(
      make_input([make_game()], { time_zone: 'America/Los_Angeles' }),
      LABELS,
    );

    expect(pacific.html).toMatch(/4:00\s?PM PDT/);
  });

  it('falls back to UTC for a null or invalid time zone', () => {
    for (const time_zone of [null, 'Not/AZone']) {
      const result = render_games_digest(make_input([make_game()], { time_zone }), LABELS);
      expect(result.html).toMatch(/11:00\s?PM UTC/);
      expect(result.text).toMatch(/Generated .*UTC/);
    }
  });

  it('shows TBD placeholders and the unscheduled heading for missing data', () => {
    const result = render_games_digest(
      make_input([
        make_game({
          home_team: null,
          away_team: null,
          local_date: null,
          organization_name: '   ',
          level: null,
          league: null,
          fee_minor: null,
        }),
      ]),
      LABELS,
    );

    expect(result.html).toContain('TBD vs TBD');
    expect(result.html).toContain('Date to be announced');
    expect(result.html).toContain('2 open positions');
    expect(result.text).toContain('Date to be announced');
  });

  it('omits the details line when a game has nothing to show beyond the open count', () => {
    const labels: IDigestLabels = { ...LABELS, format_open_positions: () => '' };
    const result = render_games_digest(
      make_input([
        make_game({ organization_name: '', level: null, league: null, fee_minor: null }),
      ]),
      labels,
    );

    expect(result.html).not.toContain('margin-top:2px');
    expect(result.text).not.toMatch(/^ {6}\S/m);
  });

  it('skips a blank greeting and a null greeting', () => {
    for (const recipient_greeting of [null, '   ']) {
      const result = render_games_digest(make_input([make_game()], { recipient_greeting }), LABELS);
      expect(result.html).not.toContain('Hi Sam');
      expect(result.text.startsWith('Games available\n\nThese games')).toBe(true);
    }
  });

  it('keeps multi-line values on a single line in the plain-text twin', () => {
    const result = render_games_digest(
      make_input([
        make_game({ home_team: 'Hawks\nBCC: evil@example.com', venue_name: 'Field\r\nA' }),
      ]),
      LABELS,
    );

    expect(result.text).not.toContain('\nBCC');
    expect(result.text).toContain('Hawks BCC: evil@example.com vs Eagles');
    expect(result.text).toContain('FIELD A');
  });

  it('falls back to an amount and code for an invalid currency', () => {
    const result = render_games_digest(
      make_input([make_game({ fee_minor: 1234, currency: 'NOT_A_CODE' })]),
      LABELS,
    );

    expect(result.html).toContain('12.34 NOT_A_CODE');
  });

  it('keeps the subject on one line', () => {
    const labels: IDigestLabels = { ...LABELS, format_subject: () => 'Line one\nBcc: x' };
    const result = render_games_digest(make_input([make_game()]), labels);

    expect(result.subject).toBe('Line one Bcc: x');
  });

  it('prints the postal address in the footer of both bodies, escaped and on one line', () => {
    const result = render_games_digest(
      make_input([make_game()], { postal_address: '1 Main St\nSuite <5>' }),
      LABELS,
    );

    expect(result.html).toContain('1 Main St Suite &lt;5&gt;');
    expect(result.html).not.toContain('Suite <5>');
    expect(result.text).toContain('1 Main St Suite <5>');
    expect(result.text.split('\n').filter((line) => line.includes('Suite'))).toHaveLength(1);
  });

  it.each([undefined, null, '', '   '])(
    'prints no postal address line for %j',
    (postal_address) => {
      const base = render_games_digest(make_input([make_game()]), LABELS);
      const result = render_games_digest(make_input([make_game()], { postal_address }), LABELS);

      expect(result.html).toBe(base.html);
      expect(result.text).toBe(base.text);
    },
  );

  it('keeps the line breaks of a multi-line intro in the HTML and the text', () => {
    const labels: IDigestLabels = { ...LABELS, intro: 'First line\r\nSecond <b>line</b>' };
    const result = render_games_digest(make_input([make_game()]), labels);

    expect(result.html).toContain('First line<br>Second &lt;b&gt;line&lt;/b&gt;');
    expect(result.text).toContain('First line\r\nSecond <b>line</b>');
  });
});
