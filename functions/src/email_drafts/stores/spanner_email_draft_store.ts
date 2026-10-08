import { Database } from '@google-cloud/spanner';
import { IGameView } from '../../domain/games/game_view.model.js';
import { run_write_transaction } from '../../sync/stores/run_write_transaction.js';
import {
  parse_json,
  to_nullable_number,
  to_nullable_string,
  to_number,
} from '../../sync/stores/spanner_row_values.js';
import { BeginSendOutcome } from '../enums/begin_send_outcome.enum.js';
import { DeleteDraftOutcome } from '../enums/delete_draft_outcome.enum.js';
import { DraftStatus } from '../enums/draft_status.enum.js';
import { DraftWriteOutcome } from '../enums/draft_write_outcome.enum.js';
import { IBeginSendResult } from '../models/begin_send_result.model.js';
import { IDraftContent } from '../models/draft_content.model.js';
import { IDraftGameSnapshot } from '../models/draft_game_snapshot.model.js';
import { IDraftWriteResult } from '../models/draft_write_result.model.js';
import { IFinishSendInput } from '../models/finish_send_input.model.js';
import { IStoredEmailDraft } from '../models/stored_email_draft.model.js';
import { IEmailDraftStore } from '../ports/email_draft_store.interface.js';
import { parse_draft_content, serialize_draft_content } from './draft_content_json.js';
import { next_draft_version } from './next_draft_version.js';

const DRAFT_COLUMNS =
  'tenant_id, draft_id, subject, status, filter_json, quick_link_id, recipient_count, sent_at, ' +
  'created_at, created_by, updated_at, updated_by';

const DRAFT_KEY_SQL = 'WHERE tenant_id = @tenant_id AND draft_id = @draft_id';

/** The statuses stored in `email_drafts.status`. */
const KNOWN_STATUSES: ReadonlySet<string> = new Set(Object.values(DraftStatus));

/**
 * Spanner `IEmailDraftStore` over `email_drafts` and `email_draft_games`. It uses the Spanner
 * client directly instead of core-server's CRUD helpers to match the other stores: callers stamp
 * the rows and write the audit rows themselves. Every state change is a read-modify-write inside
 * one read-write transaction, so the checks (status, version) and the write cannot be separated
 * by another writer. The draft's content lives in `subject` and `filter_json`; `body_html` is
 * never written because the email is rendered from live data at send time.
 */
export class SpannerEmailDraftStore implements IEmailDraftStore {
  /**
   * Creates a store over an existing database handle.
   * @param database Spanner database holding the draft tables.
   */
  public constructor(private readonly database: Database) {}

  /** @inheritdoc */
  public async create_draft(draft: IStoredEmailDraft): Promise<void> {
    await this.database.table('email_drafts').insert({
      tenant_id: draft.tenant_id,
      draft_id: draft.draft_id,
      subject: draft.subject,
      status: draft.status,
      filter_json: serialize_draft_content(draft),
      quick_link_id: draft.quick_link_id,
      recipient_count: draft.recipient_count,
      sent_at: draft.sent_at,
      created_at: draft.created_at,
      created_by: draft.created_by,
      updated_at: draft.updated_at,
      updated_by: draft.updated_by,
    });
  }

  /** @inheritdoc */
  public async get_draft(tenant_id: string, draft_id: string): Promise<IStoredEmailDraft | null> {
    const [rows] = await this.database.run({
      sql: `SELECT ${DRAFT_COLUMNS} FROM email_drafts ${DRAFT_KEY_SQL}`,
      params: { tenant_id, draft_id },
      types: { tenant_id: 'string', draft_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_draft(row) : null;
  }

  /** @inheritdoc */
  public async list_drafts(tenant_id: string, limit: number): Promise<IStoredEmailDraft[]> {
    const row_limit = Math.floor(limit);
    if (!(row_limit >= 1)) {
      return [];
    }
    const [rows] = await this.database.run({
      sql:
        `SELECT ${DRAFT_COLUMNS} FROM email_drafts WHERE tenant_id = @tenant_id ` +
        'ORDER BY created_at DESC, draft_id DESC LIMIT @row_limit',
      params: { tenant_id, row_limit },
      types: { tenant_id: 'string', row_limit: 'int64' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => this.to_draft(row));
  }

  /** @inheritdoc */
  public async update_draft(
    tenant_id: string,
    draft_id: string,
    expected_updated_at: number,
    content: IDraftContent,
    now: number,
    actor: string,
  ): Promise<IDraftWriteResult> {
    return run_write_transaction(this.database, async (transaction) => {
      const existing = await this.read_in(transaction, tenant_id, draft_id);
      if (!existing) {
        return { outcome: DraftWriteOutcome.NOT_FOUND, draft: null };
      }
      if (existing.status !== DraftStatus.DRAFT) {
        return { outcome: DraftWriteOutcome.NOT_DRAFT, draft: existing };
      }
      if (existing.updated_at !== expected_updated_at) {
        return { outcome: DraftWriteOutcome.STALE, draft: existing };
      }
      const updated: IStoredEmailDraft = {
        ...existing,
        ...content,
        updated_at: next_draft_version(existing.updated_at, now),
        updated_by: actor,
      };
      transaction.update('email_drafts', {
        tenant_id,
        draft_id,
        subject: updated.subject,
        filter_json: serialize_draft_content(updated),
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      });
      return { outcome: DraftWriteOutcome.UPDATED, draft: updated };
    });
  }

  /** @inheritdoc */
  public async delete_draft(tenant_id: string, draft_id: string): Promise<DeleteDraftOutcome> {
    return run_write_transaction(this.database, async (transaction) => {
      const existing = await this.read_in(transaction, tenant_id, draft_id);
      if (!existing) {
        return DeleteDraftOutcome.NOT_FOUND;
      }
      if (existing.status !== DraftStatus.DRAFT) {
        return DeleteDraftOutcome.NOT_DRAFT;
      }
      // The interleaved game and recipient rows go with the draft (ON DELETE CASCADE).
      transaction.deleteRows('email_drafts', [[tenant_id, draft_id]]);
      return DeleteDraftOutcome.DELETED;
    });
  }

  /** @inheritdoc */
  public async begin_send(
    tenant_id: string,
    draft_id: string,
    now: number,
    actor: string,
    stale_after_ms: number,
  ): Promise<IBeginSendResult> {
    return run_write_transaction(this.database, async (transaction) => {
      const existing = await this.read_in(transaction, tenant_id, draft_id);
      if (!existing) {
        return { outcome: BeginSendOutcome.NOT_FOUND, draft: null, revert_to: DraftStatus.DRAFT };
      }
      const taking_over =
        existing.status === DraftStatus.SENDING && now - existing.updated_at >= stale_after_ms;
      const sendable =
        existing.status === DraftStatus.DRAFT ||
        existing.status === DraftStatus.PARTIALLY_SENT ||
        taking_over;
      if (!sendable) {
        return {
          outcome: BeginSendOutcome.NOT_SENDABLE,
          draft: existing,
          revert_to: DraftStatus.DRAFT,
        };
      }
      const updated: IStoredEmailDraft = {
        ...existing,
        status: DraftStatus.SENDING,
        updated_at: next_draft_version(existing.updated_at, now),
        updated_by: actor,
      };
      transaction.update('email_drafts', {
        tenant_id,
        draft_id,
        status: updated.status,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      });
      return {
        outcome: BeginSendOutcome.STARTED,
        draft: updated,
        revert_to:
          existing.status === DraftStatus.DRAFT ? DraftStatus.DRAFT : DraftStatus.PARTIALLY_SENT,
      };
    });
  }

  /** @inheritdoc */
  public async finish_send(
    tenant_id: string,
    draft_id: string,
    result: IFinishSendInput,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null> {
    return run_write_transaction(this.database, async (transaction) => {
      const existing = await this.read_in(transaction, tenant_id, draft_id);
      if (!existing || existing.status !== DraftStatus.SENDING) {
        return null;
      }
      const updated: IStoredEmailDraft = {
        ...existing,
        status: result.status,
        recipient_count: result.recipient_count,
        quick_link_id: result.quick_link_id ?? existing.quick_link_id,
        sent_at: result.sent_at ?? existing.sent_at,
        updated_at: next_draft_version(existing.updated_at, now),
        updated_by: actor,
      };
      transaction.update('email_drafts', {
        tenant_id,
        draft_id,
        status: updated.status,
        recipient_count: updated.recipient_count,
        quick_link_id: updated.quick_link_id,
        sent_at: updated.sent_at,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      });
      return updated;
    });
  }

  /** @inheritdoc */
  public async revert_send(
    tenant_id: string,
    draft_id: string,
    revert_to: DraftStatus.DRAFT | DraftStatus.PARTIALLY_SENT,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null> {
    return run_write_transaction(this.database, async (transaction) => {
      const existing = await this.read_in(transaction, tenant_id, draft_id);
      if (!existing || existing.status !== DraftStatus.SENDING) {
        return null;
      }
      const updated: IStoredEmailDraft = {
        ...existing,
        status: revert_to,
        updated_at: next_draft_version(existing.updated_at, now),
        updated_by: actor,
      };
      transaction.update('email_drafts', {
        tenant_id,
        draft_id,
        status: updated.status,
        updated_at: updated.updated_at,
        updated_by: updated.updated_by,
      });
      return updated;
    });
  }

  /** @inheritdoc */
  public async replace_draft_games(
    tenant_id: string,
    draft_id: string,
    games: IDraftGameSnapshot[],
    now: number,
    actor: string,
  ): Promise<void> {
    await run_write_transaction(this.database, async (transaction) => {
      await transaction.runUpdate({
        sql: `DELETE FROM email_draft_games ${DRAFT_KEY_SQL}`,
        params: { tenant_id, draft_id },
        types: { tenant_id: 'string', draft_id: 'string' },
      });
      if (games.length > 0) {
        transaction.insert(
          'email_draft_games',
          games.map((snapshot) => ({
            tenant_id,
            draft_id,
            game_id: snapshot.game_id,
            snapshot_json: JSON.stringify(snapshot.game),
            created_at: now,
            created_by: actor,
            updated_at: now,
            updated_by: actor,
          })),
        );
      }
    });
  }

  /** @inheritdoc */
  public async list_draft_games(
    tenant_id: string,
    draft_id: string,
  ): Promise<IDraftGameSnapshot[]> {
    const [rows] = await this.database.run({
      sql:
        'SELECT game_id, snapshot_json FROM email_draft_games ' +
        `${DRAFT_KEY_SQL} ORDER BY game_id`,
      params: { tenant_id, draft_id },
      types: { tenant_id: 'string', draft_id: 'string' },
      json: true,
    });
    return (rows as Record<string, unknown>[]).map((row) => ({
      game_id: String(row['game_id']),
      game: parse_json<IGameView | null>(row['snapshot_json'], 'snapshot_json', null) as IGameView,
    }));
  }

  /**
   * Reads one draft inside a transaction.
   * @param transaction The open transaction.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns The draft, or null.
   */
  private async read_in(
    transaction: Parameters<Parameters<typeof run_write_transaction>[1]>[0],
    tenant_id: string,
    draft_id: string,
  ): Promise<IStoredEmailDraft | null> {
    const [rows] = await transaction.run({
      sql: `SELECT ${DRAFT_COLUMNS} FROM email_drafts ${DRAFT_KEY_SQL}`,
      params: { tenant_id, draft_id },
      types: { tenant_id: 'string', draft_id: 'string' },
      json: true,
    });
    const [row] = rows as Record<string, unknown>[];
    return row ? this.to_draft(row) : null;
  }

  /**
   * Maps a query row to the stored model.
   * @param row Row selected with `DRAFT_COLUMNS` in JSON mode.
   * @returns The draft.
   * @throws Error naming the column when `status` or `filter_json` hold something unreadable.
   */
  private to_draft(row: Record<string, unknown>): IStoredEmailDraft {
    const status = String(row['status']);
    if (!KNOWN_STATUSES.has(status)) {
      throw new Error('Column status holds an unknown value');
    }
    const content = parse_draft_content(String(row['subject']), row['filter_json']);
    return {
      ...content,
      tenant_id: String(row['tenant_id']),
      draft_id: String(row['draft_id']),
      status: status as DraftStatus,
      quick_link_id: to_nullable_string(row['quick_link_id']),
      recipient_count: to_nullable_number(row['recipient_count'], 'recipient_count'),
      sent_at: to_nullable_number(row['sent_at'], 'sent_at'),
      created_at: to_number(row['created_at'], 'created_at'),
      created_by: String(row['created_by']),
      updated_at: to_number(row['updated_at'], 'updated_at'),
      updated_by: String(row['updated_by']),
    };
  }
}
