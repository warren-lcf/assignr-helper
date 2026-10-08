import { DeleteDraftOutcome } from '../enums/delete_draft_outcome.enum.js';
import { DraftStatus } from '../enums/draft_status.enum.js';
import { IBeginSendResult } from '../models/begin_send_result.model.js';
import { IDraftContent } from '../models/draft_content.model.js';
import { IDraftGameSnapshot } from '../models/draft_game_snapshot.model.js';
import { IDraftWriteResult } from '../models/draft_write_result.model.js';
import { IFinishSendInput } from '../models/finish_send_input.model.js';
import { IStoredEmailDraft } from '../models/stored_email_draft.model.js';

/**
 * Persistence port for email drafts and the games snapshotted when they are sent. Every method is
 * scoped by `tenant_id`. `updated_at` doubles as the optimistic-concurrency version: every write
 * moves it strictly forward (to the clock, or one past the old value if the clock has not moved),
 * so two writers can never both believe they saw the same version.
 */
export interface IEmailDraftStore {
  /**
   * Inserts a new draft.
   * @param draft Complete row.
   * @returns Resolves when saved.
   * @throws Error when a draft with the same (`tenant_id`, `draft_id`) exists.
   */
  create_draft(draft: IStoredEmailDraft): Promise<void>;

  /**
   * Reads one draft of a tenant.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns The draft, or null when this tenant has none with that id.
   */
  get_draft(tenant_id: string, draft_id: string): Promise<IStoredEmailDraft | null>;

  /**
   * Lists a tenant's drafts.
   * @param tenant_id Owning tenant.
   * @param limit Most drafts to return.
   * @returns Drafts newest first (`created_at` descending, then `draft_id` descending).
   */
  list_drafts(tenant_id: string, limit: number): Promise<IStoredEmailDraft[]>;

  /**
   * Replaces a draft's content, compare-and-swap style: only while the draft is still a DRAFT and
   * its `updated_at` is the one the caller read. Never throws for a lost race.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @param expected_updated_at The `updated_at` the caller last read.
   * @param content New content.
   * @param now UTC milliseconds for the stamp.
   * @param actor Actor to stamp as `updated_by`.
   * @returns UPDATED with the new draft, or why nothing changed.
   */
  update_draft(
    tenant_id: string,
    draft_id: string,
    expected_updated_at: number,
    content: IDraftContent,
    now: number,
    actor: string,
  ): Promise<IDraftWriteResult>;

  /**
   * Deletes a draft that is still a DRAFT, together with anything recorded under it.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns What happened.
   */
  delete_draft(tenant_id: string, draft_id: string): Promise<DeleteDraftOutcome>;

  /**
   * Takes the send lock: moves a DRAFT or PARTIALLY_SENT draft to SENDING in one atomic step, so
   * of any number of simultaneous callers exactly one gets STARTED. A draft that has been SENDING
   * for at least `stale_after_ms` (its sender must have died) can be taken over, and reverts to
   * PARTIALLY_SENT.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @param now UTC milliseconds for the stamp and the staleness test.
   * @param actor Actor to stamp as `updated_by`.
   * @param stale_after_ms How long a SENDING lock stands before it can be taken over.
   * @returns STARTED with the locked draft, or why not.
   */
  begin_send(
    tenant_id: string,
    draft_id: string,
    now: number,
    actor: string,
    stale_after_ms: number,
  ): Promise<IBeginSendResult>;

  /**
   * Ends a send: moves a SENDING draft to SENT or PARTIALLY_SENT and records the totals.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @param result How the send ended.
   * @param now UTC milliseconds for the stamp.
   * @param actor Actor to stamp as `updated_by`.
   * @returns The draft, or null when it is not SENDING (or does not exist), in which case nothing changed.
   */
  finish_send(
    tenant_id: string,
    draft_id: string,
    result: IFinishSendInput,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null>;

  /**
   * Abandons a send before anything was delivered: moves a SENDING draft back.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @param revert_to DRAFT or PARTIALLY_SENT, as reported by `begin_send`.
   * @param now UTC milliseconds for the stamp.
   * @param actor Actor to stamp as `updated_by`.
   * @returns The draft, or null when it is not SENDING (or does not exist).
   */
  revert_send(
    tenant_id: string,
    draft_id: string,
    revert_to: DraftStatus.DRAFT | DraftStatus.PARTIALLY_SENT,
    now: number,
    actor: string,
  ): Promise<IStoredEmailDraft | null>;

  /**
   * Replaces the games recorded for a draft with the ones just emailed, as one step.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @param games The games exactly as listed in the email.
   * @param now UTC milliseconds for the stamp.
   * @param actor Actor to stamp.
   * @returns Resolves when saved.
   */
  replace_draft_games(
    tenant_id: string,
    draft_id: string,
    games: IDraftGameSnapshot[],
    now: number,
    actor: string,
  ): Promise<void>;

  /**
   * Reads the games recorded for a draft.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns The snapshots ordered by game id.
   */
  list_draft_games(tenant_id: string, draft_id: string): Promise<IDraftGameSnapshot[]>;
}
