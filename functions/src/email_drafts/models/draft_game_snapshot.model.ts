import { IGameView } from '../../domain/games/game_view.model.js';

/** A game exactly as it was listed in a sent email. */
export interface IDraftGameSnapshot {
  game_id: string;
  game: IGameView;
}
