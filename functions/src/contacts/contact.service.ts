import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { mask_contact_email } from '../domain/email/mask_contact_email.js';
import { parse_email_address } from '../domain/email/parse_email_address.js';
import { has_control_characters } from '../domain/text/has_control_characters.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { CONTACT_LIMITS } from './contact_limits.constant.js';
import { ConsentStatus } from './enums/consent_status.enum.js';
import { CreateContactOutcome } from './enums/create_contact_outcome.enum.js';
import { ContactExistsError } from './errors/contact_exists.error.js';
import { ContactLimitReachedError } from './errors/contact_limit_reached.error.js';
import { ContactNotFoundError } from './errors/contact_not_found.error.js';
import { IImportContactEntry } from './models/import_contact_entry.model.js';
import { IImportContactsResult, IImportRowProblem } from './models/import_contacts_result.model.js';
import { INewContactInput } from './models/new_contact_input.model.js';
import { IStoredContact } from './models/stored_contact.model.js';
import { IContactStore } from './ports/contact_store.interface.js';

/** Audit resource type for a single contact. */
export const CONTACT_AUDIT_RESOURCE = 'contact';

/** Audit resource type for one import of contacts. */
export const CONTACT_IMPORT_AUDIT_RESOURCE = 'contact_import';

/** Dependencies of the contact service. */
export interface IContactServiceOptions {
  contacts: IContactStore;
  audit: AuditLogService;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  generate_id: () => string;
}

/**
 * Lets a tenant owner manage the people they email. Adding a contact requires the owner's
 * attestation that the person agreed (enforced by the request schema), never re-subscribes
 * anyone who opted out, and writes an audit row whose address is masked.
 */
export class ContactService {
  /**
   * Creates the service.
   * @param options Store, audit log, clock and id generator.
   */
  public constructor(private readonly options: IContactServiceOptions) {}

  /**
   * Lists a tenant's contacts.
   * @param tenant_id Owning tenant.
   * @returns Up to 1000 contacts in display name order, including those who unsubscribed.
   */
  public async list_contacts(tenant_id: string): Promise<IStoredContact[]> {
    return this.options.contacts.list_contacts(tenant_id, {
      consent_status: null,
      limit: CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT,
    });
  }

  /**
   * Adds one contact whose consent the owner has attested.
   * @param actor Who is acting.
   * @param input Validated name and normalised address.
   * @returns The new contact.
   * @throws ContactLimitReachedError when the tenant holds the most contacts it may.
   * @throws ContactExistsError when the address is already a contact, or opted out earlier. An
   *   unsubscribed contact is never re-subscribed by adding the address again.
   */
  public async create_contact(
    actor: IActingUser,
    input: INewContactInput,
  ): Promise<IStoredContact> {
    if (
      (await this.options.contacts.count_contacts(actor.tenant_id)) >=
      CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT
    ) {
      throw new ContactLimitReachedError(CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT);
    }
    const contact = this.new_contact(actor, input);
    const outcome = await this.options.contacts.create_contact(contact);
    if (outcome !== CreateContactOutcome.CREATED) {
      throw new ContactExistsError();
    }
    await this.audit(actor, AuditAction.CREATE, contact.contact_id, null, contact);
    return contact;
  }

  /**
   * Adds many contacts the owner attests agreed to receive these emails. A row that is not
   * acceptable is reported and skipped without stopping the rest; a row whose address is
   * already known (or repeated in the same import, or opted out earlier) is counted as skipped.
   * One audit row records the import's counts and the new contact ids, with no addresses.
   * @param actor Who is acting.
   * @param entries Rows as typed, 1 to 200 of them.
   * @returns How many were added, how many were skipped as known, and the refused rows.
   */
  public async import_contacts(
    actor: IActingUser,
    entries: IImportContactEntry[],
  ): Promise<IImportContactsResult> {
    let held = await this.options.contacts.count_contacts(actor.tenant_id);
    const seen = new Set<string>();
    const added_ids: string[] = [];
    const invalid: IImportRowProblem[] = [];
    let skipped_existing = 0;

    for (const [index, entry] of entries.entries()) {
      const row = index + 1;
      const checked = this.check_entry(entry);
      if ('reason' in checked) {
        invalid.push({ row, reason: checked.reason });
        continue;
      }
      if (seen.has(checked.email_address)) {
        skipped_existing += 1;
        continue;
      }
      seen.add(checked.email_address);
      if (held >= CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT) {
        invalid.push({ row, reason: 'The contact limit has been reached' });
        continue;
      }
      const contact = this.new_contact(actor, checked);
      const outcome = await this.options.contacts.create_contact(contact);
      if (outcome === CreateContactOutcome.CREATED) {
        held += 1;
        added_ids.push(contact.contact_id);
      } else {
        skipped_existing += 1;
      }
    }

    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: CONTACT_IMPORT_AUDIT_RESOURCE,
      resource_id: this.options.generate_id(),
      action: AuditAction.CREATE,
      after_state: {
        consent_attested: true,
        added: added_ids.length,
        skipped_existing,
        invalid: invalid.length,
        added_contact_ids: added_ids,
      },
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
    return { added: added_ids.length, skipped_existing, invalid };
  }

  /**
   * Deletes a contact. When the contact had unsubscribed, the address stays blocked.
   * @param actor Who is acting.
   * @param contact_id Contact to delete.
   * @returns Resolves once deleted.
   * @throws ContactNotFoundError when the tenant has no such contact.
   */
  public async delete_contact(actor: IActingUser, contact_id: string): Promise<void> {
    const deleted = await this.options.contacts.delete_contact(
      actor.tenant_id,
      contact_id,
      this.options.now(),
      actor.user_id,
    );
    if (!deleted) {
      throw new ContactNotFoundError(contact_id);
    }
    await this.audit(actor, AuditAction.DELETE, contact_id, deleted, null);
  }

  /**
   * Checks one imported row.
   * @param entry The row as typed.
   * @returns The usable name and address, or the reason the row is refused.
   */
  private check_entry(entry: IImportContactEntry): INewContactInput | { reason: string } {
    const email_address = parse_email_address(entry.email_address);
    if (email_address === null) {
      return { reason: 'The email address is not valid' };
    }
    const typed_name = entry.display_name?.trim() ?? '';
    if (typed_name === '') {
      return { email_address, display_name: email_address.split('@')[0] };
    }
    if (has_control_characters(typed_name)) {
      return { reason: 'The name must not contain control characters or line breaks' };
    }
    if (typed_name.length > CONTACT_LIMITS.MAX_DISPLAY_NAME_LENGTH) {
      return {
        reason: `The name must be at most ${CONTACT_LIMITS.MAX_DISPLAY_NAME_LENGTH} characters`,
      };
    }
    return { email_address, display_name: typed_name };
  }

  private new_contact(actor: IActingUser, input: INewContactInput): IStoredContact {
    const now = this.options.now();
    return {
      tenant_id: actor.tenant_id,
      contact_id: this.options.generate_id(),
      display_name: input.display_name,
      email_address: input.email_address,
      consent_status: ConsentStatus.GRANTED,
      consent_updated_at: now,
      unsubscribed_at: null,
      created_at: now,
      created_by: actor.user_id,
      updated_at: now,
      updated_by: actor.user_id,
    };
  }

  /** Audit state is a deliberate allow-list: ids, consent and a masked address, never the address or name. */
  private audit_state(contact: IStoredContact | null): object | null {
    if (!contact) return null;
    return {
      contact_id: contact.contact_id,
      email_masked: mask_contact_email(contact.email_address),
      consent_status: contact.consent_status,
    };
  }

  private async audit(
    actor: IActingUser,
    action: AuditAction,
    contact_id: string,
    before: IStoredContact | null,
    after: IStoredContact | null,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: CONTACT_AUDIT_RESOURCE,
      resource_id: contact_id,
      action,
      before_state: this.audit_state(before),
      after_state:
        action === AuditAction.CREATE
          ? { ...this.audit_state(after), consent_attested: true }
          : this.audit_state(after),
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
