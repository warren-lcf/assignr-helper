import { hash_quick_link_token } from '../../../domain/quick_links/hash_quick_link_token.js';
import { IStoredQuickLink } from '../../models/stored_quick_link.model.js';

/**
 * Builds an active, never-viewed, unrestricted quick link for contract tests. The token hash
 * derives from the link id and tenant so several links never collide on the unique hash index.
 * @param tenant_id Owning tenant.
 * @param link_id Primary key of the link within the tenant.
 * @param overrides Fields to replace.
 * @returns A complete link.
 */
export function make_contract_quick_link(
  tenant_id: string,
  link_id: string,
  overrides: Partial<IStoredQuickLink> = {},
): IStoredQuickLink {
  return {
    tenant_id,
    link_id,
    token_hash: hash_quick_link_token(`${tenant_id}/${link_id}`),
    scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
    expires_at: null,
    revoked_at: null,
    last_viewed_at: null,
    view_count: 0,
    email_draft_id: null,
    created_at: 1000,
    created_by: 'creator',
    updated_at: 1000,
    updated_by: 'creator',
    ...overrides,
  };
}
