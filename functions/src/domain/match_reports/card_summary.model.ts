import { ICardCounts } from './card_counts.model.js';

/** Card tallies per team side. */
export interface ICardSummary {
  home: ICardCounts;
  away: ICardCounts;
  /** Cards recorded without a team side. */
  unassigned: ICardCounts;
}
