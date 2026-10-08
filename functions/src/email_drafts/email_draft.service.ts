import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { IContactStore } from '../contacts/ports/contact_store.interface.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { EMAIL_DRAFT_LIMITS } from './email_draft_limits.constant.js';
import { DeleteDraftOutcome } from './enums/delete_draft_outcome.enum.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import { DraftWriteOutcome } from './enums/draft_write_outcome.enum.js';
import { DraftConflictError } from './errors/draft_conflict.error.js';
import { DraftLockedError } from './errors/draft_locked.error.js';
import { DraftValidationError } from './errors/draft_validation.error.js';
import { EmailDraftNotFoundError } from './errors/email_draft_not_found.error.js';
import { IDraftContent } from './models/draft_content.model.js';
import { IStoredEmailDraft } from './models/stored_email_draft.model.js';
import { IEmailDraftStore } from './ports/email_draft_store.interface.js';

/** Audit resource type for email drafts. */
export const EMAIL_DRAFT_AUDIT_RESOURCE = 'email_draft';

/** Dependencies of the email draft service. */
export interface IEmailDraftServiceOptions {
  drafts: IEmailDraftStore;
  contacts: IContactStore;
  audit: AuditLogService;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  generate_id: () => string;
}

/**
 * Lets a tenant owner write, change, list and delete email drafts. A draft holds only the
 * choices (subject, filters, recipients); the email is built from live data when previewed or
 * sent. Changes are optimistic: the write succeeds only if the draft is still the version that
 * was read and still a DRAFT, and after losing a race the update re-reads and tries again, so a
 * concurrent send can never be overwritten by an edit.
 */
export class EmailDraftService {
  /**
   * Creates the service.
   * @param options Stores, audit log, clock and id generator.
   */
  public constructor(private readonly options: IEmailDraftServiceOptions) {}

  /**
   * Creates a draft.
   * @param actor Who is acting.
   * @param content Validated content.
   * @returns The new draft, in status DRAFT.
   * @throws DraftValidationError when a chosen contact does not belong to the tenant.
   */
  public async create_draft(
    actor: IActingUser,
    content: IDraftContent,
  ): Promise<IStoredEmailDraft> {
    await this.check_contacts(actor.tenant_id, content);
    const now = this.options.now();
    const draft: IStoredEmailDraft = {
      ...content,
      tenant_id: actor.tenant_id,
      draft_id: this.options.generate_id(),
      status: DraftStatus.DRAFT,
      quick_link_id: null,
      recipient_count: null,
      sent_at: null,
      created_at: now,
      created_by: actor.user_id,
      updated_at: now,
      updated_by: actor.user_id,
    };
    await this.options.drafts.create_draft(draft);
    await this.audit(actor, AuditAction.CREATE, draft.draft_id, null, draft);
    return draft;
  }

  /**
   * Replaces a draft's content while it is still a DRAFT.
   * @param actor Who is acting.
   * @param draft_id Draft to change.
   * @param content Validated content.
   * @returns The updated draft.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   * @throws DraftLockedError when a send has started or finished.
   * @throws DraftValidationError when a chosen contact does not belong to the tenant.
   * @throws DraftConflictError when the draft kept changing under every attempt.
   */
  public async update_draft(
    actor: IActingUser,
    draft_id: string,
    content: IDraftContent,
  ): Promise<IStoredEmailDraft> {
    await this.check_contacts(actor.tenant_id, content);
    for (let attempt = 0; attempt < EMAIL_DRAFT_LIMITS.MAX_UPDATE_ATTEMPTS; attempt++) {
      const before = await this.get_draft(actor.tenant_id, draft_id);
      if (before.status !== DraftStatus.DRAFT) {
        throw new DraftLockedError(draft_id);
      }
      const result = await this.options.drafts.update_draft(
        actor.tenant_id,
        draft_id,
        before.updated_at,
        content,
        this.options.now(),
        actor.user_id,
      );
      switch (result.outcome) {
        case DraftWriteOutcome.UPDATED:
          if (result.draft) {
            await this.audit(actor, AuditAction.UPDATE, draft_id, before, result.draft);
            return result.draft;
          }
          break;
        case DraftWriteOutcome.NOT_FOUND:
          throw new EmailDraftNotFoundError(draft_id);
        case DraftWriteOutcome.NOT_DRAFT:
          throw new DraftLockedError(draft_id);
        case DraftWriteOutcome.STALE:
          // Someone changed it since we read it: read again and retry.
          break;
      }
    }
    throw new DraftConflictError(draft_id);
  }

  /**
   * Reads one draft.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft id.
   * @returns The draft.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   */
  public async get_draft(tenant_id: string, draft_id: string): Promise<IStoredEmailDraft> {
    const draft = await this.options.drafts.get_draft(tenant_id, draft_id);
    if (!draft) {
      throw new EmailDraftNotFoundError(draft_id);
    }
    return draft;
  }

  /**
   * Lists a tenant's drafts.
   * @param tenant_id Owning tenant.
   * @returns Up to 200 drafts, newest first.
   */
  public async list_drafts(tenant_id: string): Promise<IStoredEmailDraft[]> {
    return this.options.drafts.list_drafts(tenant_id, EMAIL_DRAFT_LIMITS.MAX_LISTED_DRAFTS);
  }

  /**
   * Deletes a draft that is still a DRAFT.
   * @param actor Who is acting.
   * @param draft_id Draft to delete.
   * @returns Resolves once deleted.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   * @throws DraftLockedError when the draft is sending or has been sent.
   */
  public async delete_draft(actor: IActingUser, draft_id: string): Promise<void> {
    const before = await this.get_draft(actor.tenant_id, draft_id);
    const outcome = await this.options.drafts.delete_draft(actor.tenant_id, draft_id);
    if (outcome === DeleteDraftOutcome.NOT_FOUND) {
      throw new EmailDraftNotFoundError(draft_id);
    }
    if (outcome === DeleteDraftOutcome.NOT_DRAFT) {
      throw new DraftLockedError(draft_id);
    }
    await this.audit(actor, AuditAction.DELETE, draft_id, before, null);
  }

  /**
   * Checks that every chosen contact belongs to the tenant.
   * @param tenant_id Owning tenant.
   * @param content Draft content.
   * @returns Resolves when all exist.
   * @throws DraftValidationError naming each contact id that does not.
   */
  private async check_contacts(tenant_id: string, content: IDraftContent): Promise<void> {
    if (content.contact_ids.length === 0) {
      return;
    }
    const found = new Set(
      (await this.options.contacts.find_contacts(tenant_id, content.contact_ids)).map(
        (contact) => contact.contact_id,
      ),
    );
    const violations = content.contact_ids.flatMap((contact_id, index) =>
      found.has(contact_id)
        ? []
        : [{ path: `contact_ids.${index}`, message: 'Must be a contact of this tenant' }],
    );
    if (violations.length > 0) {
      throw new DraftValidationError(violations);
    }
  }

  /** Audit state is a deliberate allow-list: ids, status and choices, never contact addresses. */
  private audit_state(draft: IStoredEmailDraft | null): object | null {
    if (!draft) return null;
    return {
      draft_id: draft.draft_id,
      subject: draft.subject,
      status: draft.status,
      recipient_mode: draft.recipient_mode,
      selected_contact_count: draft.contact_ids.length,
      include_quick_link: draft.include_quick_link,
      quick_link_expiry_days: draft.quick_link_expiry_days,
    };
  }

  private async audit(
    actor: IActingUser,
    action: AuditAction,
    draft_id: string,
    before: IStoredEmailDraft | null,
    after: IStoredEmailDraft | null,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: EMAIL_DRAFT_AUDIT_RESOURCE,
      resource_id: draft_id,
      action,
      before_state: this.audit_state(before),
      after_state: this.audit_state(after),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
