import { CreateContactOutcome } from '../enums/create_contact_outcome.enum.js';
import { IListContactsOptions } from '../models/list_contacts_options.model.js';
import { IMarkUnsubscribedResult } from '../models/mark_unsubscribed_result.model.js';
import { IStoredContact } from '../models/stored_contact.model.js';

/** Persistence port for contacts. Every method is scoped by `tenant_id`. */
export interface IContactStore {
  /**
   * Saves a new contact unless the tenant already has one with the same address, or the address
   * belongs to someone who unsubscribed and was deleted. Never throws for either reason, and
   * never changes an existing contact.
   * @param contact Complete row; `email_address` already normalised.
   * @returns What happened.
   */
  create_contact(contact: IStoredContact): Promise<CreateContactOutcome>;

  /**
   * Reads one contact of a tenant.
   * @param tenant_id Owning tenant.
   * @param contact_id Contact id.
   * @returns The contact, or null when this tenant has none with that id.
   */
  get_contact(tenant_id: string, contact_id: string): Promise<IStoredContact | null>;

  /**
   * Reads several contacts of a tenant at once.
   * @param tenant_id Owning tenant.
   * @param contact_ids Ids to read; duplicates are fine.
   * @returns The contacts that exist for this tenant, in no particular order; other tenants' ids and unknown ids are simply absent.
   */
  find_contacts(tenant_id: string, contact_ids: string[]): Promise<IStoredContact[]>;

  /**
   * Lists a tenant's contacts.
   * @param tenant_id Owning tenant.
   * @param options Consent filter and row limit.
   * @returns Contacts ordered by display name (ignoring case), then contact id, at most `limit`.
   */
  list_contacts(tenant_id: string, options: IListContactsOptions): Promise<IStoredContact[]>;

  /**
   * Counts a tenant's contacts, whatever their consent.
   * @param tenant_id Owning tenant.
   * @returns The number of contacts.
   */
  count_contacts(tenant_id: string): Promise<number>;

  /**
   * Deletes a contact. When the contact had unsubscribed, a suppression record (a hash of the
   * address, not the address) is kept so the same address can never be added again.
   * @param tenant_id Owning tenant.
   * @param contact_id Contact id.
   * @param now UTC milliseconds, stamped on the suppression record when one is kept.
   * @param actor Actor, stamped on the suppression record when one is kept.
   * @returns The contact as it was, or null when this tenant has no such contact.
   */
  delete_contact(
    tenant_id: string,
    contact_id: string,
    now: number,
    actor: string,
  ): Promise<IStoredContact | null>;

  /**
   * Withdraws a contact's consent, compare-and-swap style: only a contact whose consent is still
   * GRANTED changes, so of several simultaneous calls exactly one sees `changed`. Calling it for
   * an already unsubscribed contact succeeds and changes nothing.
   * @param tenant_id Owning tenant.
   * @param contact_id Contact id.
   * @param now UTC milliseconds for `unsubscribed_at`, `consent_updated_at` and `updated_at`.
   * @param actor Actor to stamp as `updated_by`.
   * @returns The result, or null when this tenant has no such contact.
   */
  mark_unsubscribed(
    tenant_id: string,
    contact_id: string,
    now: number,
    actor: string,
  ): Promise<IMarkUnsubscribedResult | null>;
}
