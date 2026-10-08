import { GameSlotState } from '../../games/enums/game_slot_state.enum';
import { IGameSlotView } from '../../games/models/game_slot_view.model';
import { IPublicGameSlot } from '../models/public_game_slot.model';

/**
 * Maps the public page's positions to the shape the games screen already turns into chips. A visitor
 * never holds a position, so each one is open or filled.
 * @param slots The game's positions; absent when the server predates position details.
 * @returns The positions in the games screen's shape.
 */
export function to_game_slot_views(slots: readonly IPublicGameSlot[] | undefined): IGameSlotView[] {
  return (slots ?? []).map((slot) => ({
    position: slot.position,
    state: slot.is_open ? GameSlotState.OPEN : GameSlotState.FILLED,
  }));
}
