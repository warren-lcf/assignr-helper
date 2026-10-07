import { constant_time_token_hash_equals } from '../domain/quick_links/constant_time_token_hash_equals.js';
import { evaluate_quick_link_state } from '../domain/quick_links/evaluate_quick_link_state.js';
import { filter_public_games } from '../domain/quick_links/filter_public_games.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { list_public_game_options } from '../domain/quick_links/list_public_game_options.js';
import { IPublicGameFilters } from '../domain/quick_links/public_game_filters.model.js';
import { IPublicGamesResult } from '../domain/quick_links/public_games_result.model.js';
import { QuickLinkState } from '../domain/quick_links/quick_link_state.enum.js';
import { to_public_games } from '../domain/quick_links/to_public_games.js';
import { to_quick_link_game_source } from '../domain/quick_links/to_quick_link_game_source.js';
import { group_games } from '../domain/games/group_games.js';
import { GameListScope } from '../sync/enums/game_list_scope.enum.js';
import { IGameStore } from '../sync/ports/game_store.interface.js';
import { IVenueStore } from '../sync/ports/venue_store.interface.js';
import { IStoredQuickLink } from './models/stored_quick_link.model.js';
import { IQuickLinkStore } from './ports/quick_link_store.interface.js';
import { QUICK_LINK_LIMITS } from './quick_link_limits.constant.js';

/**
 * Stands in for a stored hash when a lookup finds nothing, so a miss does the same comparison
 * work as a hit and the two cannot be told apart by timing.
 */
const MISS_HASH = hash_quick_link_token('no quick link has this token');

/** Dependencies of the public quick-link service. */
export interface IPublicQuickLinkServiceOptions {
  quick_links: IQuickLinkStore;
  games: IGameStore;
  venues: IVenueStore;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
}

/**
 * Serves the games behind a quick link to anyone who holds its token, with no sign-in. It reads
 * our stored copy at request time and reduces it to the public shape; it never calls the
 * provider.
 */
export class PublicQuickLinkService {
  /**
   * Creates the service.
   * @param options Stores and clock.
   */
  public constructor(private readonly options: IPublicQuickLinkServiceOptions) {}

  /**
   * Resolves a token to its link when, and only when, the link may be used right now.
   * Unknown, revoked and expired tokens all give the same answer (null), after the same work:
   * one lookup through the unique index on the hash and one constant-time hash comparison.
   * @param token A well-formed bearer token (shape is checked by the caller).
   * @returns The active link, or null when no usable link has this token.
   */
  public async open_link(token: string): Promise<IStoredQuickLink | null> {
    const token_hash = hash_quick_link_token(token);
    const found = await this.options.quick_links.find_by_token_hash(token_hash);
    const matches = constant_time_token_hash_equals(found?.token_hash ?? MISS_HASH, token_hash);
    if (!found || !matches) {
      return null;
    }
    const state = evaluate_quick_link_state(found, this.options.now());
    return state === QuickLinkState.ACTIVE ? found : null;
  }

  /**
   * Lists the games a link shows: open games with an unfilled slot that have not started, inside
   * the link's scope, narrowed by the visitor's filters, grouped by location, date and time and
   * capped. Records the view afterwards; a failure to record never fails the request.
   * @param link An active link from `open_link`.
   * @param filters The visitor's validated filters.
   * @returns The grouped public games, the pre-cap total and the filter options.
   */
  public async get_games(
    link: IStoredQuickLink,
    filters: IPublicGameFilters,
  ): Promise<IPublicGamesResult> {
    const now = this.options.now();
    // Games that already started are never public, so the window opens at now rather than now minus
    // the signed-in list's three hour look-back; the results are identical.
    const [stored, venues] = await Promise.all([
      this.options.games.list_games({
        tenant_id: link.tenant_id,
        window_start: now,
        window_end: now + QUICK_LINK_LIMITS.PUBLIC_LOOKAHEAD_MS,
        scope: GameListScope.OPEN,
      }),
      this.options.venues.list_venues(link.tenant_id),
    ]);
    const venue_by_id = new Map(venues.map((venue) => [venue.venue_id, venue]));
    const visible = to_public_games(
      stored.map((game) =>
        to_quick_link_game_source(
          game,
          game.venue_id === null ? null : (venue_by_id.get(game.venue_id) ?? null),
        ),
      ),
      link.scope,
      now,
    );
    const options = list_public_game_options(visible);
    const matching = filter_public_games(visible, filters);
    // The games are in start order, so the cap keeps the soonest ones.
    const capped = matching.slice(0, QUICK_LINK_LIMITS.MAX_PUBLIC_GAMES_PER_RESPONSE);

    await this.record_view(link, now);

    return {
      as_of: now,
      total: matching.length,
      locations: group_games(capped),
      levels: options.levels,
      leagues: options.leagues,
      location_groups: options.location_groups,
    };
  }

  /**
   * Counts a view. Best effort: a failure is logged and swallowed, because a visitor must not
   * lose the page over a counter.
   * @param link The viewed link.
   * @param now UTC milliseconds of the view.
   * @returns Resolves once the view was recorded or the failure was logged.
   */
  private async record_view(link: IStoredQuickLink, now: number): Promise<void> {
    try {
      await this.options.quick_links.record_view(link.tenant_id, link.link_id, now);
    } catch (error) {
      console.error('Could not record a quick link view', link.link_id, error);
    }
  }
}
