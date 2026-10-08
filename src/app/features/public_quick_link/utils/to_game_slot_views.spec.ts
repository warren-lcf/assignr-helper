import { describe, expect, it } from 'vitest';
import { GameSlotState } from '../../games/enums/game_slot_state.enum';
import { to_game_slot_views } from './to_game_slot_views';

describe('to_game_slot_views', () => {
  it('maps open positions to open and the rest to filled, keeping the names and order', () => {
    expect(
      to_game_slot_views([
        { position: 'Referee', is_open: true },
        { position: 'Asst. Referee', is_open: false },
      ]),
    ).toEqual([
      { position: 'Referee', state: GameSlotState.OPEN },
      { position: 'Asst. Referee', state: GameSlotState.FILLED },
    ]);
  });

  it('returns an empty list when the server sent no position details', () => {
    expect(to_game_slot_views(undefined)).toEqual([]);
  });
});
