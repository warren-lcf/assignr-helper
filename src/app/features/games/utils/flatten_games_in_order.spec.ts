import { RIVERSIDE_LOCATION, UNKNOWN_LOCATION } from '../mocks/game_view.mock';
import { flatten_games_in_order } from './flatten_games_in_order';

describe('flatten_games_in_order', () => {
  it('lists every game in the order the server sent them: location, then date, then time', () => {
    const flat = flatten_games_in_order([RIVERSIDE_LOCATION, UNKNOWN_LOCATION]);

    expect(flat.map((game) => game.game_id)).toEqual(['game-1', 'game-2', 'game-3', 'game-4']);
  });

  it('is empty for no locations, and does not change its input', () => {
    const locations = [RIVERSIDE_LOCATION];
    flatten_games_in_order(locations);

    expect(flatten_games_in_order([])).toEqual([]);
    expect(locations[0].dates[0].games).toHaveLength(2);
  });
});
