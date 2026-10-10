import { hash_bearer_token } from '@hch-shared-libraries/core-server';
import { describe, expect, it, vi } from 'vitest';
import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { GameListScope } from '../sync/enums/game_list_scope.enum.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { IStoredGameSlot } from '../sync/models/stored_game_slot.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { InMemoryGameStore } from '../sync/stores/in_memory_game_store.js';
import { InMemoryOrganizationStore } from '../sync/stores/in_memory_organization_store.js';
import { InMemoryVenueStore } from '../sync/stores/in_memory_venue_store.js';
import { CALENDAR_FEED_LIMITS } from './calendar_feed_limits.constant.js';
import { PublicCalendarFeedService } from './public_calendar_feed.service.js';
import { InMemoryCalendarFeedStore } from './stores/in_memory_calendar_feed_store.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 9, 12);
const ORIGIN = 'https://app.example.test';

/**
 * Builds the service over in-memory stores and a fixed clock.
 * @returns The service and the stores a spec seeds.
 */
function make_service() {
  const feeds = new InMemoryCalendarFeedStore();
  const games = new InMemoryGameStore();
  const venues = new InMemoryVenueStore();
  const organizations = new InMemoryOrganizationStore();
  const service = new PublicCalendarFeedService({
    feeds,
    games,
    venues,
    organizations,
    public_app_origin: ORIGIN,
    now: () => NOW,
  });
  return { service, feeds, games, venues, organizations };
}

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
    slot_id: `slot-${position}-${is_mine}-${Math.random()}`,
    position,
    assignee_name: null,
    assignment_external_id: 'a-1',
    response_status: AssignmentResponseStatus.UNRESPONDED,
    is_mine,
    lock_version: null,
    fees: [],
    ...overrides,
  };
}

/**
 * Builds one of the account's games.
 * @param game_id Primary key.
 * @param overrides Fields to replace.
 * @returns A stored game that belongs to tenant t1 and is mine.
 */
function my_game(game_id: string, overrides: Partial<IStoredGame> = {}): IStoredGame {
  return make_contract_game('t1', game_id, {
    start_at: NOW + DAY,
    is_open: false,
    is_mine: true,
    home_team: 'Hawks',
    away_team: 'Eagles',
    slots: [make_slot('Referee', true)],
    ...overrides,
  });
}

/**
 * Removes the folds, so a long line reads as one.
 * @param ics Calendar text.
 * @returns The unfolded text.
 */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, '');
}

/**
 * Lists the UID of every event.
 * @param ics Calendar text.
 * @returns The UIDs, in order.
 */
function uids_of(ics: string): string[] {
  return [...unfold(ics).matchAll(/^UID:(.*)$/gm)].map((match) =>
    (match[1] ?? '').replace('\r', ''),
  );
}

describe('PublicCalendarFeedService.render_ics', () => {
  describe('the calendar text', () => {
    it('is a CRLF-terminated VCALENDAR with one VEVENT per game', async () => {
      const { service, games } = make_service();
      await games.save_games([my_game('g1'), my_game('g2', { start_at: NOW + 2 * DAY })]);

      const ics = await service.render_ics('t1');

      expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
      expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
      expect(ics).toContain('VERSION:2.0\r\n');
      expect(ics).toContain('X-WR-CALNAME:My referee schedule\r\n');
      expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
      expect(ics.match(/END:VEVENT/g)).toHaveLength(2);
      expect(/(?<!\r)\n/.test(ics)).toBe(false);
    });

    it('is a valid empty calendar when no game qualifies', async () => {
      const { service } = make_service();

      const ics = await service.render_ics('t1');

      expect(ics).toContain('BEGIN:VCALENDAR\r\n');
      expect(ics).toContain('END:VCALENDAR\r\n');
      expect(ics).not.toContain('BEGIN:VEVENT');
    });

    it('gives each game a stable UID that survives two generations', async () => {
      const { service, games } = make_service();
      await games.save_games([my_game('g1'), my_game('g2', { start_at: NOW + 2 * DAY })]);

      const first = await service.render_ics('t1');
      const second = await service.render_ics('t1');

      expect(uids_of(first)).toEqual(['game-g1@hch-calendar-feed', 'game-g2@hch-calendar-feed']);
      expect(uids_of(second)).toEqual(uids_of(first));
    });

    it('writes start and end in UTC with a Z, defaulting the end to 90 minutes', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('g1', { start_at: Date.UTC(2026, 9, 10, 14), end_at: null }),
        my_game('g2', {
          start_at: Date.UTC(2026, 9, 11, 9, 30),
          end_at: Date.UTC(2026, 9, 11, 11),
        }),
      ]);

      const ics = await service.render_ics('t1');

      expect(ics).toContain('DTSTART:20261010T140000Z\r\n');
      expect(ics).toContain('DTEND:20261010T153000Z\r\n');
      expect(ics).toContain('DTSTART:20261011T093000Z\r\n');
      expect(ics).toContain('DTEND:20261011T110000Z\r\n');
      expect(ics).not.toContain('VALUE=DATE');
    });

    it('titles each event "Home vs Away (Position)" and gives it a DTSTAMP', async () => {
      const { service, games } = make_service();
      await games.save_games([my_game('g1')]);

      const ics = await service.render_ics('t1');

      expect(ics).toContain('SUMMARY:Hawks vs Eagles (Referee)\r\n'.replace(',', ','));
      expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z\r\n/);
    });

    it('escapes commas, semicolons, backslashes and newlines in text values', async () => {
      const { service, games, venues } = make_service();
      const [venue] = await venues.upsert_venues(
        't1',
        'c1',
        [
          {
            external_id: 'v-1',
            name: 'Field 1; North, Gate\nB',
            address_line: 'C:\\temp',
            city: 'Leesburg',
            region: 'VA',
            postal_code: '20176',
            latitude: null,
            longitude: null,
            time_zone: null,
          },
        ],
        'a',
        1,
      );
      await games.save_games([
        my_game('g1', {
          venue_id: venue!.venue_id,
          home_team: 'Smith, Jones; & Co',
          away_team: 'Line\nBreak',
          level: 'U12',
        }),
      ]);

      const text = unfold(await service.render_ics('t1'));

      expect(text).toContain('SUMMARY:Smith\\, Jones\\; & Co vs Line Break (Referee)\r\n');
      expect(text).toContain(
        'LOCATION:Field 1\\; North\\, Gate B\\, C:\\\\temp\\, Leesburg\\, VA\\, 20176\r\n',
      );
      expect(text).toContain(
        'DESCRIPTION:Position: Referee\\nLevel: U12\\nOpen in Assignr Helper: https://app.example.test/games\r\n',
      );
    });

    it('folds every physical line to at most 75 octets, keeping multi-byte characters whole', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('g1', {
          home_team: '\u8db3\u7403\u30af\u30e9\u30d6 '.repeat(8),
          away_team: '\u00c9lite Fu\u00dfball '.repeat(8),
          league: 'L '.repeat(200),
        }),
      ]);

      const ics = await service.render_ics('t1');

      for (const line of ics.split('\r\n')) {
        expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
      }
      expect(ics).toContain('\r\n ');
      expect(unfold(ics)).toContain('\u8db3\u7403\u30af\u30e9\u30d6');
      expect(ics).not.toContain('\ufffd');
    });
  });

  describe('which games appear', () => {
    it('includes only games the account holds', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('mine'),
        my_game('open_only', { is_mine: false, is_open: true }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-mine@hch-calendar-feed']);
    });

    it('leaves out cancelled games', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('kept'),
        my_game('cancelled', { status: GameStatus.CANCELLED }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-kept@hch-calendar-feed']);
    });

    it('leaves out removed games', async () => {
      const { service, games } = make_service();
      await games.save_games([my_game('kept'), my_game('removed', { removed_at: NOW - 1 })]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-kept@hch-calendar-feed']);
    });

    it("never includes another tenant's games", async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('mine'),
        make_contract_game('t2', 'theirs', {
          start_at: NOW + DAY,
          is_mine: true,
          is_open: false,
          home_team: 'Secret FC',
        }),
      ]);

      const ics = await service.render_ics('t1');

      expect(ics).not.toContain('theirs');
      expect(ics).not.toContain('Secret FC');
      expect(uids_of(await service.render_ics('t2'))).toEqual(['game-theirs@hch-calendar-feed']);
    });

    it('ignores rows the game store should not have returned', async () => {
      const { service, games } = make_service();
      vi.spyOn(games, 'list_games').mockResolvedValue([
        my_game('ok'),
        my_game('other_tenant', { tenant_id: 't2' }),
        my_game('not_mine', { is_mine: false, is_open: true }),
        my_game('cancelled', { status: GameStatus.CANCELLED }),
        my_game('removed', { removed_at: NOW - 1 }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-ok@hch-calendar-feed']);
    });

    it('starts 30 days before now, inclusive', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('edge_in', { start_at: NOW - 30 * DAY }),
        my_game('edge_out', { start_at: NOW - 30 * DAY - 1 }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-edge_in@hch-calendar-feed']);
    });

    it('ends 365 days after now, inclusive', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('edge_in', { start_at: NOW + 365 * DAY }),
        my_game('edge_out', { start_at: NOW + 365 * DAY + 1 }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual(['game-edge_in@hch-calendar-feed']);
    });

    it('lists games soonest first', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('late', { start_at: NOW + 5 * DAY }),
        my_game('early', { start_at: NOW + DAY }),
        my_game('past', { start_at: NOW - 3 * DAY }),
      ]);

      expect(uids_of(await service.render_ics('t1'))).toEqual([
        'game-past@hch-calendar-feed',
        'game-early@hch-calendar-feed',
        'game-late@hch-calendar-feed',
      ]);
    });

    it('caps the feed at 1000 events, keeping the soonest', async () => {
      const { service, games } = make_service();
      const many = Array.from({ length: CALENDAR_FEED_LIMITS.MAX_EVENTS + 1 }, (_, i) =>
        my_game(`g${String(i).padStart(4, '0')}`, { start_at: NOW + i * 60_000 }),
      );
      await games.save_games(many);

      const uids = uids_of(await service.render_ics('t1'));

      expect(uids).toHaveLength(1000);
      expect(uids[0]).toBe('game-g0000@hch-calendar-feed');
      expect(uids).not.toContain('game-g1000@hch-calendar-feed');
    });

    it("reads only the tenant's own games in the 30 day to 365 day window", async () => {
      const { service, games } = make_service();
      const list = vi.spyOn(games, 'list_games');

      await service.render_ics('t1');

      expect(list).toHaveBeenCalledWith({
        tenant_id: 't1',
        window_start: NOW - 30 * DAY,
        window_end: NOW + 365 * DAY,
        scope: GameListScope.MINE,
      });
    });
  });

  describe('what each event reveals', () => {
    it('adds the venue, the assignor, my positions and the details that exist', async () => {
      const { service, games, venues, organizations } = make_service();
      const [venue] = await venues.upsert_venues(
        't1',
        'c1',
        [
          {
            external_id: 'v-1',
            name: 'Riverside Park',
            address_line: '12 Main St',
            city: 'Leesburg',
            region: 'VA',
            postal_code: '20176',
            latitude: null,
            longitude: null,
            time_zone: 'America/New_York',
          },
        ],
        'a',
        1,
      );
      const [organization] = await organizations.upsert_organizations(
        't1',
        'c1',
        [{ external_id: 'o-1', name: 'Metro Soccer', flags: {} }],
        'a',
        1,
      );
      await games.save_games([
        my_game('g1', {
          venue_id: venue!.venue_id,
          organization_id: organization!.organization_id,
          level: 'U12',
          league: 'Spring',
          age_group: 'U12 Girls',
          slots: [make_slot('Referee', true), make_slot('Asst. Referee', false)],
        }),
      ]);

      const text = unfold(await service.render_ics('t1'));

      expect(text).toContain(
        'LOCATION:Riverside Park\\, 12 Main St\\, Leesburg\\, VA\\, 20176\r\n',
      );
      expect(text).toContain(
        'DESCRIPTION:Position: Referee\\nLevel: U12\\nLeague: Spring\\nAge group: U12 Girls\\n' +
          'Assignor: Metro Soccer\\nOpen in Assignr Helper: https://app.example.test/games\r\n',
      );
    });

    it('omits the location line when the game has no venue', async () => {
      const { service, games } = make_service();
      await games.save_games([my_game('g1', { venue_id: null })]);

      expect(await service.render_ics('t1')).not.toContain('LOCATION');
    });

    it('never reveals other officials, fees, provider ids or the raw payload', async () => {
      const { service, games } = make_service();
      await games.save_games([
        my_game('g1', {
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
        }),
      ]);

      const ics = unfold(await service.render_ics('t1'));

      for (const secret of [
        'Pat Official',
        'Pat',
        'provider-ext-id',
        'raw payload',
        '9001',
        '7777',
        'a-other',
        'Asst. Referee',
        'ext-g1',
      ]) {
        expect(ics).not.toContain(secret);
      }
    });
  });
});

describe('PublicCalendarFeedService.open_feed', () => {
  const TOKEN = 'T'.repeat(43);

  it('resolves a token to its tenant and records the fetch with the clock', async () => {
    const { service, feeds } = make_service();
    await feeds.set_token('t1', hash_bearer_token(TOKEN));

    expect(await service.open_feed(TOKEN)).toBe('t1');

    expect(await feeds.get_feed('t1')).toMatchObject({ fetch_count: 1, last_fetched_at: NOW });
  });

  it('answers null for an unknown token and records nothing', async () => {
    const { service, feeds } = make_service();
    await feeds.set_token('t1', hash_bearer_token(TOKEN));

    expect(await service.open_feed('U'.repeat(43))).toBeNull();

    expect(await feeds.get_feed('t1')).toMatchObject({ fetch_count: 0 });
  });

  it('looks the hash up once, never the token itself', async () => {
    const { service, feeds } = make_service();
    const find = vi.spyOn(feeds, 'find_subscriber_by_token_hash');

    await service.open_feed(TOKEN);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(hash_bearer_token(TOKEN));
  });

  it('still resolves the token when recording the fetch fails, logging it without the token', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, feeds } = make_service();
    await feeds.set_token('t1', hash_bearer_token(TOKEN));
    vi.spyOn(feeds, 'record_fetch').mockRejectedValue(new Error('spanner unavailable'));

    expect(await service.open_feed(TOKEN)).toBe('t1');

    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain(TOKEN);
    error.mockRestore();
  });

  it('fails when the lookup itself fails, rather than pretending the token is unknown', async () => {
    const { service, feeds } = make_service();
    vi.spyOn(feeds, 'find_subscriber_by_token_hash').mockRejectedValue(new Error('down'));

    await expect(service.open_feed(TOKEN)).rejects.toThrow('down');
  });
});
