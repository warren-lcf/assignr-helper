import { GamesScope } from '../../games/enums/games_scope.enum';
import { build_games_window_query } from './build_games_window_query';

const NOW = Date.UTC(2026, 9, 10, 15, 0, 0);

describe('build_games_window_query', () => {
  it('asks for the referee’s own games, cancelled ones left out', () => {
    const query = build_games_window_query(NOW);

    expect(query.scope).toBe(GamesScope.MINE);
    expect(query.include_cancelled).toBe(false);
    expect(query.only_with_open_slots).toBe(false);
  });

  it('looks back seven days and ahead twelve hours', () => {
    const query = build_games_window_query(NOW);

    expect(query.from).toBe(NOW - 7 * 86_400_000);
    expect(query.to).toBe(NOW + 12 * 3_600_000);
  });
});
