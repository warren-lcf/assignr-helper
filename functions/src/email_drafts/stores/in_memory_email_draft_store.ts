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
import { next_draft_version } from './next_draft_version.js';

/** In-memory `IEmailDraftStore` for tests and local development. Reads and writes are copies. */
export class InMemoryEmailDraftStore implements IEmailDraftStore {
  private readonly rows = new Map<string, IStoredEmailDraft>();
  private readonly games = new Map<string, IDraftGameSnapshot[]>();

  /** @inheritdoc */
  public async create_draft(draft: IStoredEmailDraft): Promise<void> {
    const key = this.key_of(draft.tenant_id, draft.draft_id);
    if (this.rows.has(key)) {
      throw new Error('A draft with this id already exists');
    }
    this.rows.set(key, structuredClone(draft));
  }

  /** @inheritdoc */
  public async get_draft(tenant_id: string, draft_id: string): Promise<IStoredEmailDraft | null> {
    const row = this.rows.get(this.key_of(tenant_id, draft_id));
    return row ? structuredClone(row) : null;
  }

  /** @inheritdoc */
  public async list_drafts(tenant_id: string, limit: number): Promise<IStoredEmailDraft[]> {
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id)
      .sort((a, b) => {
        if (a.created_at !== b.created_at) {
          return b.created_at - a.created_at;
        }
        if (a.draft_id === b.draft_id) {
          return 0;
        }
        return a.draft_id < b.draft_id ? 1 : -1;
      })
      .slice(0, Math.max(0, limit))
      .map((row) => structuredClone(row));
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
    const key = this.key_of(tenant_id, draft_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return { outcome: DraftWriteOutcome.NOT_FOUND, draft: null };
    }
    if (existing.status !== DraftStatus.DRAFT) {
      return { outcome: DraftWriteOutcome.NOT_DRAFT, draft: structuredClone(existing) };
    }
    if (existing.updated_at !== expected_updated_at) {
      return { outcome: DraftWriteOutcome.STALE, draft: structuredClone(existing) };
    }
    const updated: IStoredEmailDraft = {
      ...existing,
      ...structuredClone(content),
      updated_at: next_draft_version(existing.updated_at, now),
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return { outcome: DraftWriteOutcome.UPDATED, draft: structuredClone(updated) };
  }

  /** @inheritdoc */
  public async delete_draft(tenant_id: string, draft_id: string): Promise<DeleteDraftOutcome> {
    const key = this.key_of(tenant_id, draft_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return DeleteDraftOutcome.NOT_FOUND;
    }
    if (existing.status !== DraftStatus.DRAFT) {
      return DeleteDraftOutcome.NOT_DRAFT;
    }
    this.rows.delete(key);
    this.games.delete(key);
    return DeleteDraftOutcome.DELETED;
  }

  /** @inheritdoc */
  public async begin_send(
    tenant_id: string,
    draft_id: string,
    now: number,
    actor: string,
    stale_after_ms: number,
  ): Promise<IBeginSendResult> {
    const key = this.key_of(tenant_id, draft_id);
    const existing = this.rows.get(key);
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
        draft: structuredClone(existing),
        revert_to: DraftStatus.DRAFT,
      };
    }
    const updated: IStoredEmailDraft = {
      ...existing,
      status: DraftStatus.SENDING,
      updated_at: next_draft_version(existing.updated_at, now),
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return {
      outcome: BeginSendOutcome.STARTED,
      draft: structuredClone(updated),
      revert_to:
        existing.status === DraftStatus.DRAFT ? DraftStatus.DRAFT : DraftStatus.PARTIALLY_SENT,
    };
  }

  /** @inheritdoc */
  public async finish_send(
    tenant_id: string,
    draft_id: string,
    result: IFinishSendInput,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null> {
    const key = this.key_of(tenant_id, draft_id);
    const existing = this.rows.get(key);
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
    this.rows.set(key, updated);
    return structuredClone(updated);
  }

  /** @inheritdoc */
  public async revert_send(
    tenant_id: string,
    draft_id: string,
    revert_to: DraftStatus.DRAFT | DraftStatus.PARTIALLY_SENT,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null> {
    const key = this.key_of(tenant_id, draft_id);
    const existing = this.rows.get(key);
    if (!existing || existing.status !== DraftStatus.SENDING) {
      return null;
    }
    const updated: IStoredEmailDraft = {
      ...existing,
      status: revert_to,
      updated_at: next_draft_version(existing.updated_at, now),
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return structuredClone(updated);
  }

  /** @inheritdoc */
  public async replace_draft_games(
    tenant_id: string,
    draft_id: string,
    games: IDraftGameSnapshot[],
    _now: number,
    _actor: string,
  ): Promise<void> {
    this.games.set(this.key_of(tenant_id, draft_id), structuredClone(games));
  }

  /** @inheritdoc */
  public async list_draft_games(
    tenant_id: string,
    draft_id: string,
  ): Promise<IDraftGameSnapshot[]> {
    return structuredClone(this.games.get(this.key_of(tenant_id, draft_id)) ?? []).sort((a, b) => {
      if (a.game_id === b.game_id) {
        return 0;
      }
      return a.game_id < b.game_id ? -1 : 1;
    });
  }

  private key_of(tenant_id: string, draft_id: string): string {
    return JSON.stringify([tenant_id, draft_id]);
  }
}
