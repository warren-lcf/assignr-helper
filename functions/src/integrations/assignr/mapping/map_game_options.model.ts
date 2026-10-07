/** Context the game mapper needs beyond the payload itself. */
export interface IMapGameOptions {
  /** The caller's user ids on Assignr sites; marks which slots are theirs. */
  my_user_ids: ReadonlySet<string>;
  /** Organization (site) id to use when the payload does not embed one. */
  fallback_site_id: string | null;
  /** True when the endpoint only returns the caller's own games. */
  assume_mine: boolean;
  /** True when the endpoint only returns unassigned games; false on my-games lists. */
  force_open: boolean | null;
}
