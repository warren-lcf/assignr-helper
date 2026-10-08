import { hash_email_address } from '../../domain/email/hash_email_address.js';
import { ConsentStatus } from '../enums/consent_status.enum.js';
import { CreateContactOutcome } from '../enums/create_contact_outcome.enum.js';
import { IListContactsOptions } from '../models/list_contacts_options.model.js';
import { IMarkUnsubscribedResult } from '../models/mark_unsubscribed_result.model.js';
import { IStoredContact } from '../models/stored_contact.model.js';
import { IContactStore } from '../ports/contact_store.interface.js';

/**
 * Orders contacts by display name ignoring case, then by id.
 * @param a First contact.
 * @param b Second contact.
 * @returns Negative, zero or positive ordering value.
 */
function compare_contacts(a: IStoredContact, b: IStoredContact): number {
  const a_name = a.display_name.toLowerCase();
  const b_name = b.display_name.toLowerCase();
  if (a_name !== b_name) {
    return a_name < b_name ? -1 : 1;
  }
  if (a.contact_id === b.contact_id) {
    return 0;
  }
  return a.contact_id < b.contact_id ? -1 : 1;
}

/** In-memory `IContactStore` for tests and local development. Reads and writes are copies. */
export class InMemoryContactStore implements IContactStore {
  private readonly rows = new Map<string, IStoredContact>();
  private readonly suppressed = new Set<string>();

  /** @inheritdoc */
  public async create_contact(contact: IStoredContact): Promise<CreateContactOutcome> {
    if (this.suppressed.has(this.suppression_key(contact.tenant_id, contact.email_address))) {
      return CreateContactOutcome.SUPPRESSED;
    }
    const duplicate = [...this.rows.values()].some(
      (row) =>
        row.tenant_id === contact.tenant_id &&
        row.email_address.toLowerCase() === contact.email_address.toLowerCase(),
    );
    const key = this.key_of(contact.tenant_id, contact.contact_id);
    if (duplicate || this.rows.has(key)) {
      return CreateContactOutcome.EMAIL_EXISTS;
    }
    this.rows.set(key, {
      ...structuredClone(contact),
      email_address: contact.email_address.toLowerCase(),
    });
    return CreateContactOutcome.CREATED;
  }

  /** @inheritdoc */
  public async get_contact(tenant_id: string, contact_id: string): Promise<IStoredContact | null> {
    const row = this.rows.get(this.key_of(tenant_id, contact_id));
    return row ? structuredClone(row) : null;
  }

  /** @inheritdoc */
  public async find_contacts(tenant_id: string, contact_ids: string[]): Promise<IStoredContact[]> {
    const wanted = new Set(contact_ids);
    return [...this.rows.values()]
      .filter((row) => row.tenant_id === tenant_id && wanted.has(row.contact_id))
      .map((row) => structuredClone(row));
  }

  /** @inheritdoc */
  public async list_contacts(
    tenant_id: string,
    options: IListContactsOptions,
  ): Promise<IStoredContact[]> {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.tenant_id === tenant_id &&
          (options.consent_status === null || row.consent_status === options.consent_status),
      )
      .sort(compare_contacts)
      .slice(0, Math.max(0, options.limit))
      .map((row) => structuredClone(row));
  }

  /** @inheritdoc */
  public async count_contacts(tenant_id: string): Promise<number> {
    return [...this.rows.values()].filter((row) => row.tenant_id === tenant_id).length;
  }

  /** @inheritdoc */
  public async delete_contact(
    tenant_id: string,
    contact_id: string,
    _now: number,
    _actor: string,
  ): Promise<IStoredContact | null> {
    const key = this.key_of(tenant_id, contact_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return null;
    }
    if (existing.consent_status === ConsentStatus.UNSUBSCRIBED) {
      this.suppressed.add(this.suppression_key(tenant_id, existing.email_address));
    }
    this.rows.delete(key);
    return structuredClone(existing);
  }

  /** @inheritdoc */
  public async mark_unsubscribed(
    tenant_id: string,
    contact_id: string,
    now: number,
    actor: string,
  ): Promise<IMarkUnsubscribedResult | null> {
    const key = this.key_of(tenant_id, contact_id);
    const existing = this.rows.get(key);
    if (!existing) {
      return null;
    }
    if (existing.consent_status === ConsentStatus.UNSUBSCRIBED) {
      return {
        contact: structuredClone(existing),
        before: structuredClone(existing),
        changed: false,
      };
    }
    const updated: IStoredContact = {
      ...existing,
      consent_status: ConsentStatus.UNSUBSCRIBED,
      consent_updated_at: now,
      unsubscribed_at: now,
      updated_at: now,
      updated_by: actor,
    };
    this.rows.set(key, updated);
    return { contact: structuredClone(updated), before: structuredClone(existing), changed: true };
  }

  private key_of(tenant_id: string, contact_id: string): string {
    return JSON.stringify([tenant_id, contact_id]);
  }

  private suppression_key(tenant_id: string, email_address: string): string {
    return JSON.stringify([tenant_id, hash_email_address(email_address.toLowerCase())]);
  }
}
