import { describe, expect, it } from 'vitest';
import { list_public_game_options } from './list_public_game_options.js';
import { make_public_game } from './make_public_game.fixture.js';

describe('list_public_game_options', () => {
  it('returns empty lists when there are no games', () => {
    expect(list_public_game_options([])).toEqual({ levels: [], leagues: [], location_groups: [] });
  });

  it('lists distinct values A to Z, ignoring case when sorting and when judging duplicates', () => {
    const options = list_public_game_options([
      make_public_game({ level: 'U14', league: 'spring' }),
      make_public_game({ level: 'u12', league: 'Fall' }),
      make_public_game({ level: 'u14', league: 'Spring' }),
      make_public_game({ level: '  U10  ', league: ' ' }),
    ]);

    expect(options.levels).toEqual(['U10', 'u12', 'U14']);
    expect(options.leagues).toEqual(['Fall', 'spring']);
  });

  it('sorts numbers in text naturally', () => {
    const options = list_public_game_options([
      make_public_game({ level: 'U10' }),
      make_public_game({ level: 'U9' }),
    ]);

    expect(options.levels).toEqual(['U9', 'U10']);
  });

  it('skips games that have no level or league', () => {
    const options = list_public_game_options([
      make_public_game(),
      make_public_game({ level: 'A' }),
    ]);

    expect(options.levels).toEqual(['A']);
    expect(options.leagues).toEqual([]);
  });

  it('lists resolved location labels, the group over the venue, with the unknown location last', () => {
    const options = list_public_game_options([
      make_public_game({ venue_name: null, location_group: null }),
      make_public_game({ venue_name: 'Zeta Field', location_group: null }),
      make_public_game({ venue_name: 'Field 1', location_group: 'Alpha Complex' }),
      make_public_game({ venue_name: 'Field 2', location_group: 'alpha complex' }),
    ]);

    expect(options.location_groups).toEqual([
      'Alpha Complex',
      'Zeta Field',
      'Location to be announced',
    ]);
  });

  it('orders texts that differ only by case in a stable way', () => {
    const options = list_public_game_options([
      make_public_game({ level: 'b' }),
      make_public_game({ level: 'a' }),
    ]);

    expect(options.levels).toEqual(['a', 'b']);
  });
});
