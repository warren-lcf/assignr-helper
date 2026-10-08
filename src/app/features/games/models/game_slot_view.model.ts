import { GameSlotState } from '../enums/game_slot_state.enum';

/** One officiating position of a game, as `GET /api/games` returns it. It never says who holds it. */
export interface IGameSlotView {
  /** The position as the provider names it, such as "Referee" or "Mentor"; may be empty. */
  position: string;
  state: GameSlotState;
}
