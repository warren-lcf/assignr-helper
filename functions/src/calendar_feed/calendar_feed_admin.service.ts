import { create_ics_feed_service } from '@hch-shared-libraries/core-server';
import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { IActingUser } from '../http/models/acting_user.model.js';
import { ActorScopedFeedTokenStore } from './actor_scoped_feed_token_store.js';
import { CalendarFeedStatus } from './enums/calendar_feed_status.enum.js';
import { FeedWriteMode } from './enums/feed_write_mode.enum.js';
import { CalendarFeedNotFoundError } from './errors/calendar_feed_not_found.error.js';
import { IIssuedCalendarFeed } from './models/issued_calendar_feed.model.js';
import { IStoredCalendarFeed } from './models/stored_calendar_feed.model.js';
import { ICalendarFeedStore } from './ports/calendar_feed_store.interface.js';

/** Audit resource type for calendar feeds. */
export const CALENDAR_FEED_AUDIT_RESOURCE = 'calendar_feed';

/** Dependencies of the calendar feed admin service. */
export interface ICalendarFeedAdminServiceOptions {
  feeds: ICalendarFeedStore;
  audit: AuditLogService;
  /** Makes a new bearer token; defaults to the library's 32 random bytes, base64url. Specs replace it. */
  generate_token?: () => string;
}

/**
 * Lets a tenant owner manage the tenant's one calendar feed link: create it, replace it (rotate)
 * and switch it off. Tokens come from core-server's `IcsFeedService`, which returns a token once
 * and hands the store only its hash. Every create, rotate and revoke writes an audit row carrying
 * the feed's status and rotation count, never the token or its hash.
 */
export class CalendarFeedAdminService {
  /**
   * Creates the service.
   * @param options Store, audit log and optional token generator.
   */
  public constructor(private readonly options: ICalendarFeedAdminServiceOptions) {}

  /**
   * Reads the tenant's feed.
   * @param tenant_id Owning tenant.
   * @returns The feed, or null when the tenant has none.
   */
  public async get_feed(tenant_id: string): Promise<IStoredCalendarFeed | null> {
    return this.options.feeds.get_feed(tenant_id);
  }

  /**
   * Creates the tenant's feed link. The existence check lives in the store's transaction, so two
   * simultaneous calls cannot both succeed.
   * @param actor Who is acting.
   * @returns The feed and its token, which is shown once.
   * @throws CalendarFeedExistsError when the tenant already has a feed (rotate it instead).
   */
  public async issue_feed(actor: IActingUser): Promise<IIssuedCalendarFeed> {
    const { feed, token } = await this.write_token(actor, FeedWriteMode.CREATE_ONLY);
    await this.audit(actor, AuditAction.CREATE, null, feed);
    return { feed, token };
  }

  /**
   * Replaces the tenant's token. The old link stops working in the same write.
   * @param actor Who is acting.
   * @returns The feed and its new token, which is shown once.
   * @throws CalendarFeedNotFoundError when the tenant has no feed.
   */
  public async rotate_feed(actor: IActingUser): Promise<IIssuedCalendarFeed> {
    const before = await this.options.feeds.get_feed(actor.tenant_id);
    if (!before) {
      throw new CalendarFeedNotFoundError(actor.tenant_id);
    }
    const { feed, token } = await this.write_token(actor, FeedWriteMode.REPLACE_ONLY);
    await this.audit(actor, AuditAction.KEY_RESET, before, feed);
    return { feed, token };
  }

  /**
   * Switches the feed off: the token stops working and the feed is gone. Revoking when there is
   * no feed succeeds and writes no audit row.
   * @param actor Who is acting.
   * @returns True when a feed was revoked, false when there was none.
   */
  public async revoke_feed(actor: IActingUser): Promise<boolean> {
    const before = await this.options.feeds.get_feed(actor.tenant_id);
    const service = create_ics_feed_service({ store: this.options.feeds });
    await service.revoke_feed_token(actor.tenant_id);
    if (!before) {
      return false;
    }
    await this.audit(actor, AuditAction.DELETE, before, null);
    return true;
  }

  /**
   * Mints a token through the library and stores its hash with this actor and mode.
   * @param actor Who is acting.
   * @param mode Create-only or replace-only.
   * @returns The written feed and the plaintext token.
   */
  private async write_token(actor: IActingUser, mode: FeedWriteMode): Promise<IIssuedCalendarFeed> {
    const adapter = new ActorScopedFeedTokenStore(this.options.feeds, actor.user_id, mode);
    const service = create_ics_feed_service({
      store: adapter,
      generate_token: this.options.generate_token,
    });
    const { token } =
      mode === FeedWriteMode.CREATE_ONLY
        ? await service.issue_feed_token(actor.tenant_id)
        : await service.rotate_feed_token(actor.tenant_id);
    if (!adapter.written) {
      throw new Error('The calendar feed store did not report the feed it wrote');
    }
    return { feed: adapter.written, token };
  }

  /** Audit state is a deliberate allow-list: never the token or its hash. */
  private audit_state(feed: IStoredCalendarFeed | null): object | null {
    if (!feed) return null;
    return { status: CalendarFeedStatus.ACTIVE, rotation_count: feed.rotation_count };
  }

  private async audit(
    actor: IActingUser,
    action: AuditAction,
    before: IStoredCalendarFeed | null,
    after: IStoredCalendarFeed | null,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: CALENDAR_FEED_AUDIT_RESOURCE,
      resource_id: actor.tenant_id,
      action,
      before_state: this.audit_state(before),
      after_state: this.audit_state(after),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
