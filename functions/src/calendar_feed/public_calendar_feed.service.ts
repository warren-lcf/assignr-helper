import { create_ics_feed_service, generate_ics } from '@hch-shared-libraries/core-server';
import type { IcsFeedService } from '@hch-shared-libraries/core-server';
import { to_calendar_event } from '../domain/calendar/to_calendar_event.js';
import { GameStatus } from '../integrations/enums/game_status.enum.js';
import { GameListScope } from '../sync/enums/game_list_scope.enum.js';
import { IGameStore } from '../sync/ports/game_store.interface.js';
import { IOrganizationStore } from '../sync/ports/organization_store.interface.js';
import { IVenueStore } from '../sync/ports/venue_store.interface.js';
import { BestEffortFetchRecordingStore } from './best_effort_fetch_recording_store.js';
import { CALENDAR_FEED_LIMITS } from './calendar_feed_limits.constant.js';
import { ICalendarFeedStore } from './ports/calendar_feed_store.interface.js';

/** Dependencies of the public calendar feed service. */
export interface IPublicCalendarFeedServiceOptions {
  feeds: ICalendarFeedStore;
  games: IGameStore;
  venues: IVenueStore;
  organizations: IOrganizationStore;
  /** The app's https origin, for the link back to the app in each event's description. */
  public_app_origin: string;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
}

/**
 * Serves a tenant's calendar feed to anyone who holds its token, with no sign-in. The token is
 * resolved through core-server's `IcsFeedService` and the games are read from our stored copy at
 * request time; the provider is never called.
 */
export class PublicCalendarFeedService {
  private readonly feed_tokens: IcsFeedService;

  /**
   * Creates the service.
   * @param options Stores, origin and clock.
   */
  public constructor(private readonly options: IPublicCalendarFeedServiceOptions) {
    this.feed_tokens = create_ics_feed_service({
      store: new BestEffortFetchRecordingStore(options.feeds),
      now: options.now,
    });
  }

  /**
   * Resolves a token to the tenant it belongs to. Unknown, revoked and rotated-out tokens are all
   * the same case (no feed has that hash) and do the same work: one lookup through the unique
   * index on the hash. A match also records the fetch, best effort.
   * @param token A well-formed bearer token (shape is checked by the caller).
   * @returns The tenant id, or null when no feed has this token.
   */
  public async open_feed(token: string): Promise<string | null> {
    return this.feed_tokens.resolve_feed_token(token);
  }

  /**
   * Renders the tenant's schedule: games the connected accounts hold (`is_mine`), not removed and
   * not cancelled, starting from 30 days ago to 365 days ahead, soonest first, at most 1000.
   * Cancelled and removed games are simply absent, which makes a calendar client drop them.
   * @param tenant_id Tenant whose games to render; no other tenant's rows are read.
   * @returns The RFC 5545 calendar text.
   */
  public async render_ics(tenant_id: string): Promise<string> {
    const now = this.options.now();
    const [stored, venues, organizations] = await Promise.all([
      this.options.games.list_games({
        tenant_id,
        window_start: now - CALENDAR_FEED_LIMITS.LOOKBACK_MS,
        window_end: now + CALENDAR_FEED_LIMITS.LOOKAHEAD_MS,
        scope: GameListScope.MINE,
      }),
      this.options.venues.list_venues(tenant_id),
      this.options.organizations.list_all_organizations(tenant_id),
    ]);
    const venue_by_id = new Map(venues.map((venue) => [venue.venue_id, venue]));
    const organization_by_id = new Map(
      organizations.map((organization) => [organization.organization_id, organization]),
    );
    const events = stored
      .filter(
        (game) =>
          game.tenant_id === tenant_id &&
          game.is_mine &&
          game.removed_at === null &&
          game.status !== GameStatus.CANCELLED,
      )
      .slice(0, CALENDAR_FEED_LIMITS.MAX_EVENTS)
      .map((game) =>
        to_calendar_event(
          game,
          game.venue_id === null ? null : (venue_by_id.get(game.venue_id) ?? null),
          organization_by_id.get(game.organization_id) ?? null,
          this.options.public_app_origin,
        ),
      );
    return generate_ics({
      calendar_name: CALENDAR_FEED_LIMITS.CALENDAR_NAME,
      events,
      field_filter: null,
    });
  }
}
