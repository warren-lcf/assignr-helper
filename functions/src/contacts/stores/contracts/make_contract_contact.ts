import { ConsentStatus } from '../../enums/consent_status.enum.js';
import { IStoredContact } from '../../models/stored_contact.model.js';

/**
 * Builds a granted contact for contract tests. The address derives from the tenant and contact
 * ids so several contacts never collide on the unique address index.
 * @param tenant_id Owning tenant.
 * @param contact_id Primary key of the contact within the tenant.
 * @param overrides Fields to replace.
 * @returns A complete contact.
 */
export function make_contract_contact(
  tenant_id: string,
  contact_id: string,
  overrides: Partial<IStoredContact> = {},
): IStoredContact {
  return {
    tenant_id,
    contact_id,
    display_name: `Contact ${contact_id}`,
    email_address: `${contact_id}@${tenant_id}.example.com`.toLowerCase(),
    consent_status: ConsentStatus.GRANTED,
    consent_updated_at: 1000,
    unsubscribed_at: null,
    created_at: 1000,
    created_by: 'creator',
    updated_at: 1000,
    updated_by: 'creator',
    ...overrides,
  };
}
