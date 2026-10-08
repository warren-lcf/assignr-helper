import { IGameView } from '../domain/games/game_view.model.js';
import { IRenderedDigest } from '../domain/email/rendered_digest.model.js';
import { render_games_digest } from '../domain/email/render_games_digest.js';
import { GamesListService } from '../games/games_list.service.js';
import { GameListScope } from '../sync/enums/game_list_scope.enum.js';
import { IVenueStore } from '../sync/ports/venue_store.interface.js';
import { EMAIL_DRAFT_LIMITS } from './email_draft_limits.constant.js';
import { DEFAULT_DIGEST_SENDER_NAME, make_digest_labels } from './make_digest_labels.js';
import { IDigestRenderInput } from './models/digest_render_input.model.js';
import { IDraftFilters } from './models/draft_filters.model.js';
import { ILoadedDigestGames } from './models/loaded_digest_games.model.js';
import { pick_digest_time_zone } from './pick_digest_time_zone.js';

/** Dependencies of the digest composer. */
export interface IDigestComposerOptions {
  /** The signed-in games list, reused so an email lists exactly what the app shows. */
  games_service: GamesListService;
  venues: IVenueStore;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
}

/**
 * Builds the "games available" email from live data. It asks the same games service the games
 * page uses for the tenant's open, uncancelled games that have not started and match the draft's
 * filters, so a game that was taken since the draft was written is simply not in the result.
 */
export class DigestComposer {
  /**
   * Creates the composer.
   * @param options Games service, venues and clock.
   */
  public constructor(private readonly options: IDigestComposerOptions) {}

  /**
   * Loads the open games a draft lists right now.
   * @param tenant_id Owning tenant; no other tenant's games are ever read.
   * @param filters The draft's filters.
   * @returns The games, grouped and flat, capped at 200 (the soonest kept).
   */
  public async load_games(tenant_id: string, filters: IDraftFilters): Promise<ILoadedDigestGames> {
    const now = this.options.now();
    const window_start = Math.max(now, filters.date_from ?? now);
    const window_end = Math.min(
      filters.date_to ?? now + EMAIL_DRAFT_LIMITS.DEFAULT_LOOKAHEAD_MS,
      window_start + EMAIL_DRAFT_LIMITS.MAX_WINDOW_MS,
    );
    if (window_end < window_start) {
      return { groups: [], games: [], total: 0, truncated: false, time_zone: null };
    }
    const [result, venues] = await Promise.all([
      this.options.games_service.list_games(tenant_id, {
        scope: GameListScope.OPEN,
        window_start,
        window_end,
        filters: {
          search: filters.search,
          connection_id: filters.connection_id,
          organization_id: filters.organization_id,
          league: filters.league,
          level: filters.level,
          age_group: filters.age_group,
          location_group: filters.location_group,
          only_with_open_slots: filters.only_with_open_slots,
          include_cancelled: false,
        },
        max_games: EMAIL_DRAFT_LIMITS.MAX_DIGEST_GAMES,
      }),
      this.options.venues.list_venues(tenant_id),
    ]);
    const games: IGameView[] = result.locations
      .flatMap((location) => location.dates.flatMap((date) => date.games))
      .sort((a, b) => {
        if (a.start_at !== b.start_at) {
          return a.start_at - b.start_at;
        }
        if (a.game_id === b.game_id) {
          return 0;
        }
        return a.game_id < b.game_id ? -1 : 1;
      });
    return {
      groups: result.locations,
      games,
      total: result.total,
      truncated: result.truncated,
      time_zone: pick_digest_time_zone(venues),
    };
  }

  /**
   * Renders one email.
   * @param input The draft's wording, the loaded games and the per-recipient parts.
   * @returns The subject, HTML and plain text.
   */
  public render(input: IDigestRenderInput): IRenderedDigest {
    return render_games_digest(
      {
        recipient_greeting: input.recipient_greeting,
        groups: input.games.groups,
        quick_link_url: input.quick_link_url,
        unsubscribe_url: input.unsubscribe_url,
        sender_name: input.sender_name ?? DEFAULT_DIGEST_SENDER_NAME,
        postal_address: input.postal_address,
        generated_at: this.options.now(),
        time_zone: input.games.time_zone,
      },
      make_digest_labels(input.content.subject, input.content.intro),
    );
  }
}
