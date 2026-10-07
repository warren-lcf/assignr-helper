import { MergeOutcome } from '../enums/merge_outcome.enum.js';
import { IStoredGame } from './stored_game.model.js';

/** Result of merging an incoming game into the stored copy. */
export interface IMergeResult {
  game: IStoredGame;
  outcome: MergeOutcome;
}
