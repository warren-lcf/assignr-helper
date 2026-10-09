import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';
import { IStoredGameSlot } from '../../sync/models/stored_game_slot.model.js';
import { make_contract_game } from '../../sync/stores/contracts/make_contract_game.js';
import {
  make_calendar_organization,
  make_calendar_venue,
} from './make_calendar_sources.fixture.js';
import { to_calendar_event } from './to_calendar_event.js';

const ORIGIN = 'https://app.example.test';
const START = Date.UTC(2026, 9, 10, 14);

/**
 * Builds a slot for specs.
 * @param position Position name.
 * @param is_mine True when the connected account holds it.
 * @param overrides Fields to replace.
 * @returns A slot.
 */
function make_slot(
  position: string,
  is_mine: boolean,
  overrides: Partial<IStoredGameSlot> = {},
): IStoredGameSlot {
  return {
    slot_id: `slot-${position}-${is_mine}`,
    position,
    assignee_name: null,
    assignment_external_id: is_mine ? 'a-mine' : null,
    response_status: AssignmentResponseStatus.UNRESPONDED,
    is_mine,
    lock_version: null,
    fees: [],
    ...overrides,
  };
}

/**
 * Builds one of my games with teams and my position.
 * @param overrides Fields to replace.
 * @returns A stored game.
 */
function make_my_game(overrides: Parameters<typeof make_contract_game>[2] = {}) {
  return make_contract_game('t1', 'g1', {
    start_at: START,
    is_open: false,
    is_mine: true,
    home_team: 'Hawks',
    away_team: 'Eagles',
    slots: [make_slot('Referee', true)],
    ...overrides,
  });
}

describe('to_calendar_event', () => {
  it('builds the whole event for a game with everything known', () => {
    const game = make_my_game({
      end_at: START + 2 * 3_600_000,
      level: 'U12',
      league: 'Spring League',
      age_group: 'U12 Girls',
      venue_id: 'v1',
      organization_id: 'org-1',
    });

    const event = to_calendar_event(
      game,
      make_calendar_venue(),
      make_calendar_organization(),
      ORIGIN,
    );

    expect(event).toEqual({
      event_id: 'game-g1',
      title: 'Hawks vs Eagles (Referee)',
      start_utc_ms: START,
      end_utc_ms: START + 2 * 3_600_000,
      is_all_day: false,
      location: 'Riverside Park, 12 Main St, Leesburg, VA, 20176',
      description: [
        'Position: Referee',
        'Level: U12',
        'League: Spring League',
        'Age group: U12 Girls',
        'Assignor: Metro Soccer',
        'Open in Assignr Helper: https://app.example.test/games',
      ].join('\n'),
      recurrence_rule: null,
    });
  });

  describe('event_id', () => {
    it('is stable for the same game', () => {
      const a = to_calendar_event(make_my_game(), null, null, ORIGIN);
      const b = to_calendar_event(make_my_game({ home_team: 'Changed' }), null, null, ORIGIN);

      expect(a.event_id).toBe('game-g1');
      expect(b.event_id).toBe(a.event_id);
    });

    it('differs between games', () => {
      const other = make_contract_game('t1', 'g2', { is_mine: true });

      expect(to_calendar_event(other, null, null, ORIGIN).event_id).toBe('game-g2');
    });

    it('keeps a hostile id from breaking the calendar line it is written into', () => {
      const game = make_my_game({ game_id: 'g1\r\nEND:VEVENT\r\nX-EVIL:1' });

      const { event_id } = to_calendar_event(game, null, null, ORIGIN);

      expect(event_id).toMatch(/^game-[A-Za-z0-9_-]+$/);
    });
  });

  describe('title', () => {
    it('falls back to "Game (Position)" when either team is unknown', () => {
      for (const teams of [
        { home_team: null, away_team: null },
        { home_team: 'Hawks', away_team: null },
        { home_team: null, away_team: 'Eagles' },
        { home_team: '  ', away_team: 'Eagles' },
      ]) {
        expect(to_calendar_event(make_my_game(teams), null, null, ORIGIN).title).toBe(
          'Game (Referee)',
        );
      }
    });

    it('falls back to the teams alone when the position is unknown', () => {
      const game = make_my_game({ slots: [make_slot('Referee', false)] });

      expect(to_calendar_event(game, null, null, ORIGIN).title).toBe('Hawks vs Eagles');
    });

    it('is just "Game" when neither teams nor position are known', () => {
      const game = make_my_game({ home_team: null, away_team: null, slots: [] });

      expect(to_calendar_event(game, null, null, ORIGIN).title).toBe('Game');
    });

    it('lists every position I hold once, in game order', () => {
      const game = make_my_game({
        slots: [
          make_slot('Referee', false),
          make_slot('Asst. Referee', true),
          make_slot('Referee', true, { slot_id: 's3' }),
          make_slot('Asst. Referee', true, { slot_id: 's4' }),
        ],
      });

      const event = to_calendar_event(game, null, null, ORIGIN);

      expect(event.title).toBe('Hawks vs Eagles (Asst. Referee, Referee)');
      expect(event.description).toContain('Position: Asst. Referee, Referee');
    });

    it('collapses whitespace and newlines inside team names and positions', () => {
      const game = make_my_game({
        home_team: '  Hawks\r\n  Red ',
        away_team: 'Eagles\tBlue',
        slots: [make_slot('  Asst.\nReferee  ', true)],
      });

      expect(to_calendar_event(game, null, null, ORIGIN).title).toBe(
        'Hawks Red vs Eagles Blue (Asst. Referee)',
      );
    });

    it('keeps commas, semicolons, quotes, backslashes and unicode as plain text', () => {
      const game = make_my_game({
        home_team: 'Smith, Jones; & Co "A"',
        away_team: 'Back\\slash Élite 足球 \u{1F3C6}',
      });

      expect(to_calendar_event(game, null, null, ORIGIN).title).toBe(
        'Smith, Jones; & Co "A" vs Back\\slash Élite 足球 \u{1F3C6} (Referee)',
      );
    });

    it('stays within the title limit however long the names are', () => {
      const game = make_my_game({
        home_team: 'H'.repeat(5000),
        away_team: 'A'.repeat(5000),
        slots: [make_slot('P'.repeat(5000), true)],
      });

      const { title } = to_calendar_event(game, null, null, ORIGIN);

      expect(Array.from(title).length).toBeLessThanOrEqual(200);
      expect(title).toContain('…');
    });
  });

  describe('time', () => {
    it('ends at the stored end when it is after the start', () => {
      const event = to_calendar_event(make_my_game({ end_at: START + 1000 }), null, null, ORIGIN);

      expect(event.end_utc_ms).toBe(START + 1000);
    });

    it('lasts 90 minutes when the end is missing', () => {
      const event = to_calendar_event(make_my_game({ end_at: null }), null, null, ORIGIN);

      expect(event.end_utc_ms).toBe(START + 90 * 60_000);
    });

    it.each([
      ['before the start', START - 1],
      ['equal to the start', START],
    ])('lasts 90 minutes when the stored end is %s', (_case, end_at) => {
      const event = to_calendar_event(make_my_game({ end_at }), null, null, ORIGIN);

      expect(event.end_utc_ms).toBe(START + 90 * 60_000);
    });

    it('is never an all-day or recurring event', () => {
      const event = to_calendar_event(make_my_game(), null, null, ORIGIN);

      expect(event.is_all_day).toBe(false);
      expect(event.recurrence_rule).toBeNull();
    });
  });

  describe('location', () => {
    it('is null without a venue', () => {
      expect(to_calendar_event(make_my_game(), null, null, ORIGIN).location).toBeNull();
    });

    it('joins only the address parts that exist', () => {
      const venue = make_calendar_venue({ address_line: null, region: null, postal_code: null });

      expect(to_calendar_event(make_my_game(), venue, null, ORIGIN).location).toBe(
        'Riverside Park, Leesburg',
      );
    });

    it('is just the name when the venue has no address', () => {
      const venue = make_calendar_venue({
        address_line: null,
        city: null,
        region: null,
        postal_code: null,
      });

      expect(to_calendar_event(make_my_game(), venue, null, ORIGIN).location).toBe(
        'Riverside Park',
      );
    });

    it('skips blank address parts', () => {
      const venue = make_calendar_venue({ address_line: '  ', city: '\n', region: 'VA' });

      expect(to_calendar_event(make_my_game(), venue, null, ORIGIN).location).toBe(
        'Riverside Park, VA, 20176',
      );
    });

    it('is null when the venue has nothing usable', () => {
      const venue = make_calendar_venue({
        name: ' ',
        address_line: null,
        city: null,
        region: null,
        postal_code: null,
      });

      expect(to_calendar_event(make_my_game(), venue, null, ORIGIN).location).toBeNull();
    });

    it('flattens newlines and stays within the location limit', () => {
      const venue = make_calendar_venue({
        name: 'North\nField',
        address_line: 'x'.repeat(2000),
      });

      const { location } = to_calendar_event(make_my_game(), venue, null, ORIGIN);

      expect(location).not.toMatch(/[\r\n]/);
      expect(location?.startsWith('North Field, xxx')).toBe(true);
      expect(Array.from(location ?? '').length).toBeLessThanOrEqual(300);
    });
  });

  describe('description', () => {
    it('keeps only the lines whose value exists, ending with the link back to the app', () => {
      const event = to_calendar_event(make_my_game({ level: 'U12' }), null, null, ORIGIN);

      expect(event.description).toBe(
        [
          'Position: Referee',
          'Level: U12',
          'Open in Assignr Helper: https://app.example.test/games',
        ].join('\n'),
      );
    });

    it('still carries the link when nothing else is known', () => {
      const game = make_my_game({ slots: [] });

      expect(to_calendar_event(game, null, null, ORIGIN).description).toBe(
        'Open in Assignr Helper: https://app.example.test/games',
      );
    });

    it('does not double the slash when the origin ends with one', () => {
      const event = to_calendar_event(make_my_game(), null, null, `${ORIGIN}/`);

      expect(event.description).toContain('https://app.example.test/games');
      expect(event.description).not.toContain('//games');
    });

    it('flattens newlines in each value so one value cannot forge another line', () => {
      const event = to_calendar_event(
        make_my_game({ level: 'U12\nPosition: Hacker' }),
        null,
        make_calendar_organization({ name: 'Metro\r\nSoccer' }),
        ORIGIN,
      );

      expect(event.description?.split('\n')).toEqual([
        'Position: Referee',
        'Level: U12 Position: Hacker',
        'Assignor: Metro Soccer',
        'Open in Assignr Helper: https://app.example.test/games',
      ]);
    });

    it('limits each value', () => {
      const event = to_calendar_event(
        make_my_game({ league: 'L'.repeat(5000) }),
        null,
        null,
        ORIGIN,
      );

      const league_line = event.description?.split('\n').find((line) => line.startsWith('League:'));
      expect(Array.from(league_line ?? '').length).toBeLessThanOrEqual('League: '.length + 200);
    });

    it('never carries other officials, fees, provider ids or the raw payload', () => {
      const game = make_my_game({
        external_id: 'provider-ext-id',
        raw: { secret: 'raw payload' },
        slots: [
          make_slot('Referee', true, { fees: [{ amount: 9001 }] }),
          make_slot('Asst. Referee', false, {
            assignee_name: 'Pat Official',
            assignment_external_id: 'a-other',
            fees: [{ amount: 7777 }],
          }),
        ],
      });

      const serialized = JSON.stringify(
        to_calendar_event(game, make_calendar_venue(), make_calendar_organization(), ORIGIN),
      );

      for (const secret of [
        'Pat Official',
        'provider-ext-id',
        'raw payload',
        '9001',
        '7777',
        'a-other',
      ]) {
        expect(serialized).not.toContain(secret);
      }
      expect(serialized).not.toContain('Asst. Referee');
    });
  });
});
