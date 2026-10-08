import { filter_game_views } from '../domain/games/filter_game_views.js';
import { group_games } from '../domain/games/group_games.js';
import { to_game_view } from '../domain/games/to_game_view.js';
import { IGameStore } from '../sync/ports/game_store.interface.js';
import { IOrganizationStore } from '../sync/ports/organization_store.interface.js';
import { IVenueStore } from '../sync/ports/venue_store.interface.js';
import { GAMES_LIST_LIMITS } from './games_list_limits.constant.js';
import { IGamesListRequest } from './models/games_list_request.model.js';
import { IGamesListResult } from './models/games_list_result.model.js';
import { create_games_list_query_schema } from './schemas/games_list_query.schema.js';

/** Collaborators of `GamesListService`. */
export interface IGamesListServiceOptions {
  games: IGameStore;
  venues: IVenueStore;
  organizations: IOrganizationStore;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
}

/** Reads the tenant's stored games across all connections and shapes them for display. */
export class GamesListService {
  /** Validates a request's query string and resolves its defaults against this service's clock. */
  public readonly query_schema: ReturnType<typeof create_games_list_query_schema>;

  /**
   * Creates the service.
   * @param options Stores and clock.
   */
  public constructor(private readonly options: IGamesListServiceOptions) {
    this.query_schema = create_games_list_query_schema(options.now);
  }

  /**
   * Lists a tenant's games: reads the window, resolves venue and organization names,
   * applies the filters in memory, caps the result and groups it by location, date and time.
   * @param tenant_id Tenant whose games to list; no other tenant's rows are ever read.
   * @param request Validated request.
   * @returns The grouped games, how many matched, and whether the cap cut the list short.
   */
  public async list_games(
    tenant_id: string,
    request: IGamesListRequest,
  ): Promise<IGamesListResult> {
    const [stored, venues, organizations] = await Promise.all([
      this.options.games.list_games({
        tenant_id,
        window_start: request.window_start,
        window_end: request.window_end,
        scope: request.scope,
      }),
      this.options.venues.list_venues(tenant_id),
      this.options.organizations.list_all_organizations(tenant_id),
    ]);
    const venue_by_id = new Map(venues.map((venue) => [venue.venue_id, venue]));
    const organization_by_id = new Map(
      organizations.map((organization) => [organization.organization_id, organization]),
    );

    const views = filter_game_views(
      stored.map((game) =>
        to_game_view(
          game,
          game.venue_id === null ? null : (venue_by_id.get(game.venue_id) ?? null),
          organization_by_id.get(game.organization_id) ?? null,
        ),
      ),
      request.filters,
    );
    // The store returns games in start order, so the cap keeps the soonest ones.
    const capped = views.slice(0, request.max_games ?? GAMES_LIST_LIMITS.MAX_GAMES_PER_RESPONSE);
    return {
      locations: group_games(capped),
      total: views.length,
      truncated: views.length > capped.length,
    };
  }
}
