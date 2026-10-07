/** The distinct values a quick-link page can offer in its filter dropdowns. */
export interface IPublicGameOptions {
  /** Distinct levels, A to Z. */
  levels: string[];
  /** Distinct leagues, A to Z. */
  leagues: string[];
  /** Distinct resolved location labels, A to Z with the unknown location last. */
  location_groups: string[];
}
