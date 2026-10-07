import { IRevokeQuickLinkResult } from '../models/revoke_quick_link_result.model.js';
import { IStoredQuickLink } from '../models/stored_quick_link.model.js';

/** Persistence port for quick links. */
export interface IQuickLinkStore {
  /**
   * Inserts a new link.
   * @param link Complete row.
   * @returns Resolves when saved.
   * @throws Error when a link with the same (`tenant_id`, `link_id`) or the same `token_hash` exists.
   */
  create_link(link: IStoredQuickLink): Promise<void>;

  /**
   * Reads one link of a tenant.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @returns The link, or null when this tenant has none with that id.
   */
  get_link(tenant_id: string, link_id: string): Promise<IStoredQuickLink | null>;

  /**
   * Finds the link a token belongs to, across all tenants, through the unique index on the hash.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns The link, or null when no link has that hash.
   */
  find_by_token_hash(token_hash: string): Promise<IStoredQuickLink | null>;

  /**
   * Lists a tenant's links.
   * @param tenant_id Owning tenant.
   * @returns Links newest first (`created_at` descending, then `link_id` descending).
   */
  list_links(tenant_id: string): Promise<IStoredQuickLink[]>;

  /**
   * Revokes a link, compare-and-swap style: `revoked_at` is set only while it is still null, so
   * revoking twice keeps the first revocation time and exactly one caller sees `revoked_now`.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @param now UTC milliseconds to record as `revoked_at` and `updated_at`.
   * @param actor Actor to stamp as `updated_by`.
   * @returns The link and whether this call revoked it, or null when this tenant has no such link.
   */
  revoke_link(
    tenant_id: string,
    link_id: string,
    now: number,
    actor: string,
  ): Promise<IRevokeQuickLinkResult | null>;

  /**
   * Records one successful public view: increments `view_count` and moves `last_viewed_at`
   * forward (never backward). Audit stamps are left alone because a view is not an edit.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @param now UTC milliseconds of the view.
   * @returns True when the link exists and was updated.
   */
  record_view(tenant_id: string, link_id: string, now: number): Promise<boolean>;
}
