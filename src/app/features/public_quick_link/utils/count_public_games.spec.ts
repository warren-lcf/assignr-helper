import { EMPTY_PUBLIC_GAMES_RESULT, PUBLIC_GAMES_RESULT } from '../mocks/public_games_result.mock';
import { count_public_games } from './count_public_games';

describe('count_public_games', () => {
  it('counts games across locations and dates', () => {
    expect(count_public_games(PUBLIC_GAMES_RESULT)).toBe(4);
  });

  it('is zero for no answer or no games', () => {
    expect(count_public_games(undefined)).toBe(0);
    expect(count_public_games(EMPTY_PUBLIC_GAMES_RESULT)).toBe(0);
  });
});
