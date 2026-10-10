import { GamesScope } from '../../games/enums/games_scope.enum';
import { build_my_schedule_query } from './build_my_schedule_query';

const NOW = Date.UTC(2026, 9, 10, 15, 0, 0);

describe('build_my_schedule_query', () => {
  it('asks for the referee’s own games, cancelled ones left out', () => {
    const query = build_my_schedule_query(NOW);

    expect(query.scope).toBe(GamesScope.MINE);
    expect(query.include_cancelled).toBe(false);
    expect(query.only_with_open_slots).toBe(false);
  });

  it('looks back three hours and ahead 120 days', () => {
    const query = build_my_schedule_query(NOW);

    expect(query.from).toBe(NOW - 3 * 3_600_000);
    expect(query.to).toBe(NOW + 120 * 86_400_000);
  });
});
