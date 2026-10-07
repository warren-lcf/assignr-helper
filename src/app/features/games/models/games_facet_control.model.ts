import { GamesFilterKey } from '../enums/games_filter_key.enum';

/** What one facet select needs to draw itself. */
export interface IGamesFacetControl {
  /** Which filter the select edits. */
  key: GamesFilterKey;
  /** The select's label (translated). */
  label: string;
  /** Text of the "any value" option (translated). */
  any_label: string;
  /** Stable test id for the select. */
  testid: string;
  /** The values on offer. */
  options: string[];
  /** The current value; an empty string means any. */
  selected: string;
}
