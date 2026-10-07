import { GamesErrorKind } from '../enums/games_error_kind.enum';

/** A failed games call translated for the screen. */
export interface IMappedGamesError {
  kind: GamesErrorKind;
  /** Short, translated heading. */
  headline: string;
  /** Translated explanation of what to do. */
  description: string;
}
