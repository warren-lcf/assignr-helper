import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryContactStore } from '../contacts/stores/in_memory_contact_store.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { EmailDraftService } from './email_draft.service.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import { DraftWriteOutcome } from './enums/draft_write_outcome.enum.js';
import { RecipientMode } from './enums/recipient_mode.enum.js';
import { DraftConflictError } from './errors/draft_conflict.error.js';
import { DraftLockedError } from './errors/draft_locked.error.js';
import { DraftValidationError } from './errors/draft_validation.error.js';
import { EmailDraftNotFoundError } from './errors/email_draft_not_found.error.js';
import { IDraftContent } from './models/draft_content.model.js';
import { InMemoryEmailDraftStore } from './stores/in_memory_email_draft_store.js';
import { make_contract_filters } from './stores/contracts/make_contract_draft.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'TENANT_OWNER',
  effective_role: 'TENANT_OWNER',
};

const CONTENT: IDraftContent = {
  subject: 'Games',
  intro: null,
  filters: make_contract_filters(),
  include_quick_link: true,
  quick_link_expiry_days: 14,
  recipient_mode: RecipientMode.ALL_CONSENTED,
  contact_ids: [],
};

/**
 * Builds the service over in-memory parts and a clock that advances one second per reading.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const drafts = new InMemoryEmailDraftStore();
  const contacts = new InMemoryContactStore();
  const audit = create_in_memory_audit_log_store();
  let counter = 0;
  let clock = 1000;
  const service = new EmailDraftService({
    drafts,
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: () => (clock += 1000),
    generate_id: () => `d${++counter}`,
  });
  return { service, drafts, contacts, audit };
}

describe('EmailDraftService.update_draft optimistic concurrency', () => {
  it('writes against the version it read', async () => {
    const { service, drafts } = make_service();
    const created = await service.create_draft(ACTOR, CONTENT);
    const update = vi.spyOn(drafts, 'update_draft');

    await service.update_draft(ACTOR, 'd1', { ...CONTENT, subject: 'New' });

    expect(update.mock.calls[0][2]).toBe(created.updated_at);
  });

  it('re-reads and tries again after losing a race, keeping the last writer content', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    const original = drafts.update_draft.bind(drafts);
    let raced = false;
    vi.spyOn(drafts, 'update_draft').mockImplementation(async (...args) => {
      if (!raced) {
        raced = true;
        // Someone else saves first, so the version this writer read is now stale.
        await original('t1', 'd1', args[2], { ...CONTENT, subject: 'Other writer' }, 5000, 'other');
      }
      return original(...args);
    });

    const result = await service.update_draft(ACTOR, 'd1', { ...CONTENT, subject: 'Mine' });

    expect(result.subject).toBe('Mine');
    expect(drafts.update_draft).toHaveBeenCalledTimes(2);
    expect((await drafts.get_draft('t1', 'd1'))?.subject).toBe('Mine');
  });

  it('gives up with a conflict after three lost races', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    vi.spyOn(drafts, 'update_draft').mockResolvedValue({
      outcome: DraftWriteOutcome.STALE,
      draft: null,
    });

    await expect(service.update_draft(ACTOR, 'd1', CONTENT)).rejects.toBeInstanceOf(
      DraftConflictError,
    );
    expect(drafts.update_draft).toHaveBeenCalledTimes(3);
  });

  it('reports a lock taken during a retry as DraftLockedError, never overwriting a send', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    const original = drafts.update_draft.bind(drafts);
    vi.spyOn(drafts, 'update_draft').mockImplementation(async (...args) => {
      // A send starts between this writer reading the draft and writing it.
      await drafts.begin_send('t1', 'd1', 9000, 'sender', 600_000);
      return original(...args);
    });

    await expect(
      service.update_draft(ACTOR, 'd1', { ...CONTENT, subject: 'Late' }),
    ).rejects.toBeInstanceOf(DraftLockedError);
    const stored = await drafts.get_draft('t1', 'd1');
    expect(stored?.status).toBe(DraftStatus.SENDING);
    expect(stored?.subject).toBe('Games');
  });

  it('reports a draft deleted during the update as not found', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    const original = drafts.update_draft.bind(drafts);
    vi.spyOn(drafts, 'update_draft').mockImplementation(async (...args) => {
      await drafts.delete_draft('t1', 'd1');
      return original(...args);
    });

    await expect(service.update_draft(ACTOR, 'd1', CONTENT)).rejects.toBeInstanceOf(
      EmailDraftNotFoundError,
    );
  });

  it('throws DraftLockedError up front for a draft that is not a DRAFT', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    await drafts.begin_send('t1', 'd1', 9000, 'sender', 600_000);
    const update = vi.spyOn(drafts, 'update_draft');

    await expect(service.update_draft(ACTOR, 'd1', CONTENT)).rejects.toBeInstanceOf(
      DraftLockedError,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('writes no audit row for an update that did not happen', async () => {
    const { service, audit } = make_service();
    await service.create_draft(ACTOR, CONTENT);

    await expect(service.update_draft(ACTOR, 'nope', CONTENT)).rejects.toBeInstanceOf(
      EmailDraftNotFoundError,
    );

    expect(audit.rows).toHaveLength(1);
  });
});

describe('EmailDraftService contacts check', () => {
  it('names every chosen contact that is not in the tenant', async () => {
    const { service, contacts } = make_service();
    await contacts.create_contact({
      tenant_id: 't2',
      contact_id: 'theirs',
      display_name: 'Theirs',
      email_address: 'theirs@example.com',
      consent_status: 'GRANTED' as never,
      consent_updated_at: 1,
      unsubscribed_at: null,
      created_at: 1,
      created_by: 'x',
      updated_at: 1,
      updated_by: 'x',
    });

    const failure = await service
      .create_draft(ACTOR, {
        ...CONTENT,
        recipient_mode: RecipientMode.SELECTED,
        contact_ids: ['theirs', 'ghost'],
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DraftValidationError);
    expect((failure as DraftValidationError).violations.map((v) => v.path)).toEqual([
      'contact_ids.0',
      'contact_ids.1',
    ]);
  });

  it('does not look contacts up when none are chosen', async () => {
    const { service, contacts } = make_service();
    const find = vi.spyOn(contacts, 'find_contacts');

    await service.create_draft(ACTOR, CONTENT);

    expect(find).not.toHaveBeenCalled();
  });
});

describe('EmailDraftService list and delete', () => {
  it('lists newest first', async () => {
    const { service } = make_service();
    await service.create_draft(ACTOR, { ...CONTENT, subject: 'First' });
    await service.create_draft(ACTOR, { ...CONTENT, subject: 'Second' });

    expect((await service.list_drafts('t1')).map((d) => d.subject)).toEqual(['Second', 'First']);
  });

  it('refuses to delete a draft that was locked after it was read', async () => {
    const { service, drafts } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    const original = drafts.delete_draft.bind(drafts);
    vi.spyOn(drafts, 'delete_draft').mockImplementation(async (...args) => {
      await drafts.begin_send('t1', 'd1', 9000, 'sender', 600_000);
      return original(...args);
    });

    await expect(service.delete_draft(ACTOR, 'd1')).rejects.toBeInstanceOf(DraftLockedError);
    expect(await drafts.get_draft('t1', 'd1')).not.toBeNull();
  });

  it('reports a draft deleted by someone else as not found and writes no audit row', async () => {
    const { service, drafts, audit } = make_service();
    await service.create_draft(ACTOR, CONTENT);
    vi.spyOn(drafts, 'delete_draft').mockResolvedValue('NOT_FOUND' as never);

    await expect(service.delete_draft(ACTOR, 'd1')).rejects.toBeInstanceOf(EmailDraftNotFoundError);
    expect(audit.rows).toHaveLength(1);
  });
});
