import { GameSlotState } from './game_slot_state.enum.js';

/**
 * One officiating position of a game as the games list shows it. It names the position
 * and says whether it is open, but never who holds it.
 */
export interface IGameSlotView {
  /** The position as the provider names it, such as `Referee` or `Mentor`; may be empty. */
  position: string;
  state: GameSlotState;
}
