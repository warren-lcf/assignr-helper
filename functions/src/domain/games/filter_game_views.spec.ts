import { describe, expect, it } from 'vitest';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { filter_game_views } from './filter_game_views.js';
import { IGameFilters } from './game_filters.model.js';
import { IGameView } from './game_view.model.js';
import { make_game_view } from './make_game_view.fixture.js';

const NO_FILTERS: IGameFilters = {
  search: null,
  connection_id: null,
  organization_id: null,
  league: null,
  level: null,
  age_group: null,
  location_group: null,
  only_with_open_slots: false,
  include_cancelled: false,
};

/**
 * Applies filters and returns the surviving game ids.
 * @param views Views to narrow.
 * @param filters Filters to apply on top of "no filters".
 * @returns Ids of the games that remain, in order.
 */
function ids_after(views: IGameView[], filters: Partial<IGameFilters>): string[] {
  return filter_game_views(views, { ...NO_FILTERS, ...filters }).map((view) => view.game_id);
}

describe('filter_game_views', () => {
  it('keeps every non-cancelled game when no filter is set, in the original order', () => {
    const views = [make_game_view({ game_id: 'b' }), make_game_view({ game_id: 'a' })];

    expect(ids_after(views, {})).toEqual(['b', 'a']);
  });

  it('drops cancelled games unless asked to include them', () => {
    const views = [
      make_game_view({ game_id: 'live' }),
      make_game_view({ game_id: 'cancelled', status: GameStatus.CANCELLED }),
    ];

    expect(ids_after(views, {})).toEqual(['live']);
    expect(ids_after(views, { include_cancelled: true })).toEqual(['live', 'cancelled']);
  });

  it('does not mutate its input', () => {
    const views = [make_game_view({ game_id: 'a', status: GameStatus.CANCELLED })];
    const snapshot = structuredClone(views);

    filter_game_views(views, NO_FILTERS);

    expect(views).toEqual(snapshot);
  });

  describe('search', () => {
    it.each([
      ['home_team', { home_team: 'Thunder FC' }, 'thunder'],
      ['away_team', { away_team: 'Lightning SC' }, 'LIGHTNING'],
      ['league', { league: 'Metro League' }, 'metro lea'],
      ['level', { level: 'Premier' }, 'premi'],
      ['age_group', { age_group: 'U12' }, 'u12'],
      ['venue_name', { venue_name: 'Algonkian Field' }, 'algonk'],
      ['location_group', { location_group: 'North Complex' }, 'complex'],
      ['organization_name', { organization_name: 'Valley Referees' }, 'valley'],
    ] as [string, Partial<IGameView>, string][])(
      'matches %s ignoring case and partial words',
      (_field, fields, search) => {
        const views = [
          make_game_view({ game_id: 'hit', ...fields }),
          make_game_view({ game_id: 'miss' }),
        ];

        expect(ids_after(views, { search })).toEqual(['hit']);
      },
    );

    it('trims the search text and ignores a blank one', () => {
      const views = [
        make_game_view({ game_id: 'a', home_team: 'Thunder' }),
        make_game_view({ game_id: 'b', home_team: 'Lightning' }),
      ];

      expect(ids_after(views, { search: '  thunder  ' })).toEqual(['a']);
      expect(ids_after(views, { search: '   ' })).toEqual(['a', 'b']);
      expect(ids_after(views, { search: '' })).toEqual(['a', 'b']);
    });

    it('does not search the placeholder shown for an unknown location', () => {
      const views = [make_game_view({ game_id: 'a' })];

      expect(ids_after(views, { search: 'announced' })).toEqual([]);
    });

    it('does not search fields it does not list, such as the game type', () => {
      const views = [make_game_view({ game_id: 'a', game_type: 'Tournament', gender: 'Boys' })];

      expect(ids_after(views, { search: 'tournament' })).toEqual([]);
      expect(ids_after(views, { search: 'boys' })).toEqual([]);
    });
  });

  describe('exact filters', () => {
    it('filters by connection', () => {
      const views = [
        make_game_view({ game_id: 'a', connection_id: 'c1' }),
        make_game_view({ game_id: 'b', connection_id: 'c2' }),
      ];

      expect(ids_after(views, { connection_id: 'c2' })).toEqual(['b']);
    });

    it('filters by organization', () => {
      const views = [
        make_game_view({ game_id: 'a', organization_id: 'o1' }),
        make_game_view({ game_id: 'b', organization_id: 'o2' }),
      ];

      expect(ids_after(views, { organization_id: 'o1' })).toEqual(['a']);
    });

    it.each(['league', 'level', 'age_group'] as const)(
      'filters by %s exactly, ignoring case, and never by a partial value',
      (field) => {
        const views = [
          make_game_view({ game_id: 'hit', [field]: 'Premier One' }),
          make_game_view({ game_id: 'longer', [field]: 'Premier One Plus' }),
          make_game_view({ game_id: 'other', [field]: 'Select' }),
          make_game_view({ game_id: 'none', [field]: null }),
        ];

        expect(ids_after(views, { [field]: 'premier one' })).toEqual(['hit']);
      },
    );

    it('filters by the resolved location label, which is the group, else the venue name', () => {
      const views = [
        make_game_view({ game_id: 'grouped', location_group: 'North Complex', venue_name: 'F1' }),
        make_game_view({ game_id: 'venue', location_group: null, venue_name: 'North Complex' }),
        make_game_view({
          game_id: 'hidden_venue',
          location_group: 'South',
          venue_name: 'North Complex',
        }),
        make_game_view({ game_id: 'unknown' }),
      ];

      expect(ids_after(views, { location_group: 'north complex' })).toEqual(['grouped', 'venue']);
    });

    it('can select the unknown location by its label', () => {
      const views = [
        make_game_view({ game_id: 'unknown' }),
        make_game_view({ game_id: 'known', venue_name: 'F1' }),
      ];

      expect(ids_after(views, { location_group: 'Location to be announced' })).toEqual(['unknown']);
    });

    it('keeps only games with an open position when asked', () => {
      const views = [
        make_game_view({ game_id: 'open', open_slot_count: 2 }),
        make_game_view({ game_id: 'full', open_slot_count: 0 }),
      ];

      expect(ids_after(views, { only_with_open_slots: true })).toEqual(['open']);
      expect(ids_after(views, { only_with_open_slots: false })).toEqual(['open', 'full']);
    });
  });

  it('requires every populated filter to match at once', () => {
    const views = [
      make_game_view({ game_id: 'both', league: 'Metro', home_team: 'Thunder' }),
      make_game_view({ game_id: 'one', league: 'Metro', home_team: 'Lightning' }),
    ];

    expect(ids_after(views, { league: 'metro', search: 'thunder' })).toEqual(['both']);
  });
});
