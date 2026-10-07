import { EMPTY_GAMES_RESULT, GAMES_RESULT, RIVERSIDE_LOCATION } from '../mocks/game_view.mock';
import { count_games, count_location_games } from './count_games';

describe('count_games', () => {
  it('counts the games across locations and dates', () => {
    expect(count_games(GAMES_RESULT)).toBe(4);
  });

  it('counts none for an empty or missing result', () => {
    expect(count_games(EMPTY_GAMES_RESULT)).toBe(0);
    expect(count_games(undefined)).toBe(0);
  });

  it('counts the games of one location', () => {
    expect(count_location_games(RIVERSIDE_LOCATION)).toBe(3);
  });
});
