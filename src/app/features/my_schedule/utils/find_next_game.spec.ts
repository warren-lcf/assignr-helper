import { GameStatus } from '../../games/enums/game_status.enum';
import { make_game_view } from '../../games/mocks/game_view.mock';
import { find_next_game } from './find_next_game';

const NOW = Date.UTC(2026, 9, 10, 15, 0, 0);
const HOUR = 3_600_000;

describe('find_next_game', () => {
  it('picks the earliest kick-off still to come, whatever order the games arrive in', () => {
    const later = make_game_view({ game_id: 'later', start_at: NOW + 5 * HOUR });
    const sooner = make_game_view({ game_id: 'sooner', start_at: NOW + 2 * HOUR });

    expect(find_next_game([later, sooner], NOW)?.game_id).toBe('sooner');
  });

  it('keeps a game that has started but not ended', () => {
    const under_way = make_game_view({
      game_id: 'under-way',
      start_at: NOW - HOUR,
      end_at: NOW + HOUR,
    });
    const upcoming = make_game_view({ game_id: 'upcoming', start_at: NOW + 3 * HOUR });

    expect(find_next_game([upcoming, under_way], NOW)?.game_id).toBe('under-way');
  });

  it('skips a game that has ended, by its end time', () => {
    const over = make_game_view({
      game_id: 'over',
      start_at: NOW - HOUR,
      end_at: NOW - 30 * 60_000,
    });
    const upcoming = make_game_view({ game_id: 'upcoming', start_at: NOW + HOUR });

    expect(find_next_game([over, upcoming], NOW)?.game_id).toBe('upcoming');
  });

  it('assumes two hours for a game with no end time', () => {
    const recent = make_game_view({ game_id: 'recent', start_at: NOW - HOUR, end_at: null });
    const long_over = make_game_view({
      game_id: 'long-over',
      start_at: NOW - 3 * HOUR,
      end_at: null,
    });

    expect(find_next_game([long_over], NOW)).toBeNull();
    expect(find_next_game([long_over, recent], NOW)?.game_id).toBe('recent');
  });

  it('never picks a cancelled game', () => {
    const cancelled = make_game_view({
      game_id: 'cancelled',
      start_at: NOW + HOUR,
      status: GameStatus.CANCELLED,
    });
    const upcoming = make_game_view({ game_id: 'upcoming', start_at: NOW + 4 * HOUR });

    expect(find_next_game([cancelled, upcoming], NOW)?.game_id).toBe('upcoming');
  });

  it('returns null when nothing is left', () => {
    expect(find_next_game([], NOW)).toBeNull();
  });
});
