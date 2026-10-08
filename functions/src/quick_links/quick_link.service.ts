import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { evaluate_quick_link_state } from '../domain/quick_links/evaluate_quick_link_state.js';
import { generate_quick_link_token } from '../domain/quick_links/generate_quick_link_token.js';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { QuickLinkNotFoundError } from './errors/quick_link_not_found.error.js';
import { ICreateQuickLinkInput } from './models/create_quick_link_input.model.js';
import { ICreatedQuickLink } from './models/created_quick_link.model.js';
import { IQuickLinkActor } from './models/quick_link_actor.model.js';
import { IStoredQuickLink } from './models/stored_quick_link.model.js';
import { IQuickLinkStore } from './ports/quick_link_store.interface.js';
import { create_quick_link_body_schema } from './schemas/create_quick_link_body.schema.js';
import { IQuickLinkView } from './views/quick_link_view.model.js';
import { to_quick_link_view } from './views/to_quick_link_view.js';

/** Audit resource type for quick links. */
export const QUICK_LINK_AUDIT_RESOURCE = 'quick_link';

/** Dependencies of the quick-link service. */
export interface IQuickLinkServiceOptions {
  quick_links: IQuickLinkStore;
  audit: AuditLogService;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  generate_id: () => string;
  /** Makes a new bearer token; defaults to 32 random bytes, base64url. Specs replace it. */
  generate_token?: () => string;
}

/**
 * Lets a tenant owner manage quick links: create one (the token is returned exactly once and
 * only its hash is stored), list them, and revoke them. Every create and revoke writes an audit
 * row carrying the link's id, state, scope and dates, never the token or its hash.
 */
export class QuickLinkService {
  /** Validates a create request's body and resolves its defaults against this service's clock. */
  public readonly create_body_schema: ReturnType<typeof create_quick_link_body_schema>;

  /**
   * Creates the service.
   * @param options Store, audit log, clock and id generators.
   */
  public constructor(private readonly options: IQuickLinkServiceOptions) {
    this.create_body_schema = create_quick_link_body_schema(options.now);
  }

  /**
   * Creates a link and returns its token. Only the token's SHA-256 hash is stored, so the token
   * cannot be recovered later.
   * @param actor Who is acting.
   * @param input Validated scope and expiry.
   * @returns The stored link and the token, which is shown once.
   */
  public async create_link(
    actor: IQuickLinkActor,
    input: ICreateQuickLinkInput,
  ): Promise<ICreatedQuickLink> {
    const token = (this.options.generate_token ?? generate_quick_link_token)();
    const now = this.options.now();
    const link: IStoredQuickLink = {
      tenant_id: actor.tenant_id,
      link_id: this.options.generate_id(),
      token_hash: hash_quick_link_token(token),
      scope: {
        organization_ids: [...input.scope.organization_ids],
        levels: [...input.scope.levels],
        date_start: input.scope.date_start,
        date_end: input.scope.date_end,
      },
      expires_at: input.expires_at,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      email_draft_id: input.email_draft_id ?? null,
      created_at: now,
      created_by: actor.user_id,
      updated_at: now,
      updated_by: actor.user_id,
    };
    await this.options.quick_links.create_link(link);
    await this.audit(actor, AuditAction.CREATE, link.link_id, null, link, now);
    return { link, token };
  }

  /**
   * Lists a tenant's links.
   * @param tenant_id Owning tenant.
   * @returns Links newest first.
   */
  public async list_links(tenant_id: string): Promise<IStoredQuickLink[]> {
    return this.options.quick_links.list_links(tenant_id);
  }

  /**
   * Revokes a link. Revoking an already revoked link succeeds and changes nothing (and writes no
   * second audit row).
   * @param actor Who is acting.
   * @param link_id Link to revoke.
   * @returns The link, revoked.
   * @throws QuickLinkNotFoundError when the tenant has no such link.
   */
  public async revoke_link(actor: IQuickLinkActor, link_id: string): Promise<IStoredQuickLink> {
    const before = await this.options.quick_links.get_link(actor.tenant_id, link_id);
    if (!before) {
      throw new QuickLinkNotFoundError(link_id);
    }
    const now = this.options.now();
    const result = await this.options.quick_links.revoke_link(
      actor.tenant_id,
      link_id,
      now,
      actor.user_id,
    );
    if (!result) {
      throw new QuickLinkNotFoundError(link_id);
    }
    if (result.revoked_now) {
      await this.audit(actor, AuditAction.UPDATE, link_id, before, result.link, now);
    }
    return result.link;
  }

  /**
   * Projects a stored link to its API shape using this service's clock.
   * @param link Stored link.
   * @returns The view, which never contains the token or its hash.
   */
  public view_of(link: IStoredQuickLink): IQuickLinkView {
    return to_quick_link_view(link, this.options.now());
  }

  /** Audit state is a deliberate allow-list: never the token or its hash. */
  private audit_state(link: IStoredQuickLink | null, now: number): object | null {
    if (!link) return null;
    return {
      link_id: link.link_id,
      state: evaluate_quick_link_state(link, now),
      scope: link.scope,
      expires_at: link.expires_at,
      revoked_at: link.revoked_at,
    };
  }

  private async audit(
    actor: IQuickLinkActor,
    action: AuditAction,
    link_id: string,
    before: IStoredQuickLink | null,
    after: IStoredQuickLink,
    now: number,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: QUICK_LINK_AUDIT_RESOURCE,
      resource_id: link_id,
      action,
      before_state: this.audit_state(before, now),
      after_state: this.audit_state(after, now),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
