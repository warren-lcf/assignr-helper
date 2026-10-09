import {
  RIVERSIDE_LOCATION,
  SATURDAY,
  SUNDAY,
  UNKNOWN_LOCATION,
  make_public_game,
} from '../mocks/public_games_result.mock';
import { flatten_public_games } from './flatten_public_games';

describe('flatten_public_games', () => {
  it('lists every game in the order the server sent them, each with its group', () => {
    const rows = flatten_public_games([RIVERSIDE_LOCATION, UNKNOWN_LOCATION]);

    expect(rows.map((row) => [row.game.game_id, row.location_label, row.local_date])).toEqual([
      ['g1', 'Riverside Park', SATURDAY],
      ['g2', 'Riverside Park', SATURDAY],
      ['g3', 'Riverside Park', SUNDAY],
      ['g4', 'Location to be announced', null],
    ]);
  });

  it('takes the location from the server group, not from the game, which may have none', () => {
    const rows = flatten_public_games([
      {
        location_label: 'Pitch 1',
        dates: [{ local_date: SATURDAY, games: [make_public_game({ location_group: null })] }],
      },
    ]);

    expect(rows[0].location_label).toBe('Pitch 1');
  });

  it('is empty for no locations', () => {
    expect(flatten_public_games([])).toEqual([]);
  });
});
