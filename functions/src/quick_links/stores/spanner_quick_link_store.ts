import { Database } from '@google-cloud/spanner';
import { IQuickLinkScope } from '../../domain/quick_links/quick_link_scope.model.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import {
  parse_json,
  to_nullable_number,
  to_nullable_string,
  to_number,
} from '../../sync/stores/spanner_row_values.js';
import { IRevokeQuickLinkResult } from '../models/revoke_quick_link_result.model.js';
import { IStoredQuickLink } from '../models/stored_quick_link.model.js';
import { IQuickLinkStore } from '../ports/quick_link_store.interface.js';

const QUICK_LINK_COLUMNS =
  'tenant_id, link_id, token_hash, scope_json, expires_at, revoked_at, last_viewed_at, ' +
  'view_count, email_draft_id, created_at, created_by, updated_at, updated_by';

/**
 * Tells whether a value is a list of strings.
 * @param value Value to test.
 * @returns True for an array whose items are all strings.
 */
function is_string_list(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Tells whether a value is a number or null.
 * @param value Value to test.
 * @returns True for a finite number or null.
 */
function is_nullable_number(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/**
 * Spanner `IQuickLinkStore` over the `quick_links` table. It uses the Spanner client directly
 * instead of core-server's CRUD helpers to match the sync and connection stores: callers stamp
 * the rows, and counting public views through audited writes would write one audit row per view.
 * The token is never stored, only its hash; lookups by hash go through the unique index
 * `quick_links_by_token_hash`.
 */
export class SpannerQuickLinkStore implements IQuickLinkStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the `quick_links` table.
   */
  public constructor(private readonly database: Database) {}

  /**
   * Inserts a new link.
   * @param link Complete row.
   * @returns Resolves when saved.
   * @throws Error when the key or the token hash already exists (the insert and the unique index reject it).
   */
  public async create_link(link: IStoredQuickLink): Promise<void> {
    await this.database.table('quick_links').insert({
      tenant_id: link.tenant_id,
      link_id: link.link_id,
      token_hash: link.token_hash,
      scope_json: JSON.stringify(link.scope),
      expires_at: link.expires_at,
      revoked_at: link.revoked_at,
      last_viewed_at: link.last_viewed_at,
      view_count: link.view_count,
      email_draft_id: link.email_draft_id,
      created_at: link.created_at,
      created_by: link.created_by,
      updated_at: link.updated_at,
      updated_by: link.updated_by,
    });
  }

  /**
   * Reads one link, scoped to its tenant.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @returns The link, or null when this tenant has none with that id.
   */
  public async get_link(tenant_id: string, link_id: string): Promise<IStoredQuickLink | null> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${QUICK_LINK_COLUMNS} FROM quick_links ` +
        'WHERE tenant_id = @tenant_id AND link_id = @link_id',
      params: { tenant_id, link_id },
      types: { tenant_id: 'string', link_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_link(row) : null;
  }

  /**
   * Finds the link a token hash belongs to through the unique index on `token_hash`.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns The link, or null when no link has that hash.
   */
  public async find_by_token_hash(token_hash: string): Promise<IStoredQuickLink | null> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${QUICK_LINK_COLUMNS} FROM quick_links@{FORCE_INDEX=quick_links_by_token_hash} ` +
        'WHERE token_hash = @token_hash',
      params: { token_hash },
      types: { token_hash: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_link(row) : null;
  }

  /**
   * Lists a tenant's links.
   * @param tenant_id Owning tenant.
   * @returns Links newest first (`created_at` descending, then `link_id` descending).
   */
  public async list_links(tenant_id: string): Promise<IStoredQuickLink[]> {
    const [rows] = await this.database.run({
      sql:
        `SELECT ${QUICK_LINK_COLUMNS} FROM quick_links ` +
        'WHERE tenant_id = @tenant_id ORDER BY created_at DESC, link_id DESC',
      params: { tenant_id },
      types: { tenant_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_link(row));
  }

  /**
   * Revokes a link inside one read-write transaction: the row is read and `revoked_at` is written
   * only while it is still null, so of two simultaneous revokes exactly one sees `revoked_now`.
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
    return run_write_transaction(this.database, async (transaction) => {
      const [rows] = await transaction.run({
        sql:
          `SELECT ${QUICK_LINK_COLUMNS} FROM quick_links ` +
          'WHERE tenant_id = @tenant_id AND link_id = @link_id',
        params: { tenant_id, link_id },
        types: { tenant_id: 'string', link_id: 'string' },
        json: true,
      });
      const [row] = rows as Record<string, unknown>[];
      if (!row) {
        return null;
      }
      const existing = this.to_link(row);
      if (existing.revoked_at !== null) {
        return { link: existing, revoked_now: false };
      }
      transaction.update('quick_links', {
        tenant_id,
        link_id,
        revoked_at: now,
        updated_at: now,
        updated_by: actor,
      });
      return {
        link: { ...existing, revoked_at: now, updated_at: now, updated_by: actor },
        revoked_now: true,
      };
    });
  }

  /**
   * Counts one view with a single atomic UPDATE, so simultaneous views are all counted.
   * @param tenant_id Owning tenant.
   * @param link_id Link id.
   * @param now UTC milliseconds of the view.
   * @returns True when the link exists and was updated.
   */
  public async record_view(tenant_id: string, link_id: string, now: number): Promise<boolean> {
    return run_write_transaction(this.database, async (transaction) => {
      const [row_count] = await transaction.runUpdate({
        sql:
          'UPDATE quick_links SET view_count = view_count + 1, ' +
          'last_viewed_at = IF(last_viewed_at IS NULL OR last_viewed_at < @now, @now, last_viewed_at) ' +
          'WHERE tenant_id = @tenant_id AND link_id = @link_id',
        params: { tenant_id, link_id, now },
        types: { tenant_id: 'string', link_id: 'string', now: 'int64' },
      });
      return row_count > 0;
    });
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `QUICK_LINK_COLUMNS` in JSON mode.
   * @returns The link.
   * @throws Error naming `scope_json` when it does not hold a valid scope.
   */
  private to_link(row: Record<string, unknown>): IStoredQuickLink {
    return {
      tenant_id: String(row['tenant_id']),
      link_id: String(row['link_id']),
      token_hash: String(row['token_hash']),
      scope: this.to_scope(row['scope_json']),
      expires_at: to_nullable_number(row['expires_at'], 'expires_at'),
      revoked_at: to_nullable_number(row['revoked_at'], 'revoked_at'),
      last_viewed_at: to_nullable_number(row['last_viewed_at'], 'last_viewed_at'),
      view_count: to_number(row['view_count'], 'view_count'),
      email_draft_id: to_nullable_string(row['email_draft_id']),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }

  /**
   * Parses and checks `scope_json`. A scope that cannot be read is an error rather than
   * "no restriction", so a corrupt row can never widen what a link reveals.
   * @param value Raw `scope_json` cell.
   * @returns The scope.
   * @throws Error naming `scope_json` when it is missing, corrupt or the wrong shape.
   */
  private to_scope(value: unknown): IQuickLinkScope {
    const parsed = parse_json<unknown>(value, 'scope_json', null);
    const candidate = (parsed ?? {}) as Record<string, unknown>;
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !is_string_list(candidate['organization_ids']) ||
      !is_string_list(candidate['levels']) ||
      !is_nullable_number(candidate['date_start']) ||
      !is_nullable_number(candidate['date_end'])
    ) {
      throw new Error('Column scope_json does not hold a valid quick link scope');
    }
    return {
      organization_ids: candidate['organization_ids'],
      levels: candidate['levels'],
      date_start: candidate['date_start'],
      date_end: candidate['date_end'],
    };
  }
}
