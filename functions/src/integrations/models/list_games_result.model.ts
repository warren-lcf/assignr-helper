import { INormalizedGame } from './normalized_game.model.js';

/**
 * Result of a bulk game listing. Besides the games, it says how far the listing
 * can be trusted to be complete, so a sync only treats a game as gone when its
 * organization was read in full.
 */
export interface IListGamesResult {
  games: INormalizedGame[];
  /** Records the provider returned but that could not be mapped. */
  skipped_count: number;
  /**
   * Provider organization ids whose games were read completely (no failed page,
   * no skipped record). `null` means every organization was read completely;
   * an empty array means none can be trusted.
   */
  complete_organization_external_ids: string[] | null;
}
