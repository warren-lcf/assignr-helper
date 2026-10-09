import { make_game_view, make_date_group } from '../../games/mocks/game_view.mock';
import { IGamesResult } from '../../games/models/games_result.model';
import { find_game } from './find_game';

const RESULT: IGamesResult = {
  locations: [
    { location_label: 'A', dates: [make_date_group(1, [make_game_view({ game_id: 'one' })])] },
    {
      location_label: 'B',
      dates: [
        make_date_group(2, [make_game_view({ game_id: 'two' })]),
        make_date_group(3, [make_game_view({ game_id: 'three' })]),
      ],
    },
  ],
  total: 3,
  truncated: false,
};

describe('find_game', () => {
  it('finds a game in any location and date', () => {
    expect(find_game(RESULT, 'one')?.game_id).toBe('one');
    expect(find_game(RESULT, 'three')?.game_id).toBe('three');
  });

  it('is null for a game that is not there, or an empty result', () => {
    expect(find_game(RESULT, 'nine')).toBeNull();
    expect(find_game({ locations: [], total: 0, truncated: false }, 'one')).toBeNull();
  });
});
