import { get_game_end } from './get_game_end';

describe('get_game_end', () => {
  it('uses the end time when the provider gave one', () => {
    expect(get_game_end({ start_at: 1_000, end_at: 5_000 })).toBe(5_000);
  });

  it('assumes a two-hour game when there is no end time', () => {
    expect(get_game_end({ start_at: 1_000, end_at: null })).toBe(1_000 + 2 * 3_600_000);
  });
});
