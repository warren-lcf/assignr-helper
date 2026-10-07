import { IRevokeQuickLinkResult } from '../models/revoke_quick_link_result.model.js';
import { IStoredQuickLink } from '../models/stored_quick_link.model.js';
import { IQuickLinkStore } from '../ports/quick_link_store.interface.js';

/** In-memory `IQuickLinkStore` for tests and local development. Reads and writes are copies. */
export class InMemoryQuickLinkStore implements IQuickLinkStore {
  private readonly rows = new Map<string, IStoredQuickLink>();

  /**
   * Inserts a new link, storing a copy.
   * @param link Complete row.
   * @returns Resolves when saved.
   * @throws Error when the (`tenant_id`, `link_id`) key or the `token_hash` is already taken.
   */
  public async create_link(link: IStoredQuickLink): Promise<void> {
    const key = this.key_of(link.tenant_id, link.link_id);
    if (this.rows.has(key)) {
      throw new Error('A quick link with this id already exists');
    }
    if ([...this.rows.values()].some((row) => row.token_hash === link.token_hash)) {
      throw new Error('A quick link with this token hash already exists');
    }
    this.rows.set(key, structuredClone(link));
  }

  /**
   * Reads one link, scoped to its tenant.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @returns A copy of the link, or null when this tenant has none with that id.
   */
  public async get_link(tenant_id: string, link_id: string): Promise<IStoredQuickLink | null> {
    const row = this.rows.get(this.key_of(tenant_id, link_id));
    return row ? structuredClone(row) : null;
  }

  /**
   * Finds the link a token hash belongs to, across all tenants.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns A copy of the link, or null when no link has that hash.
   */
  public async find_by_token_hash(token_hash: string): Promise<IStoredQuickLink | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.token_hash === token_hash);
    return row ? structuredClone(row) : null;
  }

  /**
   * Lists a tenant's links.
   * @param tenant_id Owning tenant.
   * @returns Copies, newest first (`created_at` descending, then `link_id` descending).
   */
  public async list_links(tenant_id: string): Promise<IStoredQuickLink[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id)
      .sort((a, b) => {
        if (a.created_at !== b.created_at) {
          return b.created_at - a.created_at;
        }
        if (a.link_id === b.link_id) {
          return 0;
        }
        return a.link_id < b.link_id ? 1 : -1;
      })
      .map((row) => structuredClone(row));
  }

  /**
   * Revokes a link if it is not revoked yet.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @param now UTC milliseconds for `revoked_at` and `updated_at`.
   * @param actor Actor to stamp as `updated_by`.
   * @returns The link and whether this call revoked it, or null when this tenant has no such link.
   */
  public async revoke_link(
    tenant_id: string,
    link_id: string,
    now: number,
    actor: string,
  ): Promise<IRevokeQuickLinkResult | null> {
    const key = this.key_of(tenant_id, link_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return null;
    }
    if (existing.revoked_at !== null) {
      return { link: structuredClone(existing), revoked_now: false };
    }
    const updated: IStoredQuickLink = {
      ...existing,
      revoked_at: now,
      updated_at: now,
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return { link: structuredClone(updated), revoked_now: true };
  }

  /**
   * Counts one view.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @param now UTC milliseconds of the view.
   * @returns True when the link exists and was updated.
   */
  public async record_view(tenant_id: string, link_id: string, now: number): Promise<boolean> {
    const key = this.key_of(tenant_id, link_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return false;
    }
    this.rows.set(key, {
      ...existing,
      view_count: existing.view_count + 1,
      last_viewed_at:
        existing.last_viewed_at !== null && existing.last_viewed_at > now
          ? existing.last_viewed_at
          : now,
    });
    return true;
  }

  /**
   * Builds the map key of a row.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @returns A key that cannot collide across the two parts.
   */
  private key_of(tenant_id: string, link_id: string): string {
    return JSON.stringify([tenant_id, link_id]);
  }
}
