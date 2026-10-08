import { DraftStatus } from '../../enums/draft_status.enum.js';
import { RecipientMode } from '../../enums/recipient_mode.enum.js';
import { IDraftFilters } from '../../models/draft_filters.model.js';
import { IStoredEmailDraft } from '../../models/stored_email_draft.model.js';

/**
 * Builds a filters object with nothing selected.
 * @param overrides Fields to replace.
 * @returns Complete filters.
 */
export function make_contract_filters(overrides: Partial<IDraftFilters> = {}): IDraftFilters {
  return {
    search: null,
    level: null,
    league: null,
    age_group: null,
    location_group: null,
    organization_id: null,
    connection_id: null,
    only_with_open_slots: false,
    date_from: null,
    date_to: null,
    ...overrides,
  };
}

/**
 * Builds a fresh DRAFT for contract tests.
 * @param tenant_id Owning tenant.
 * @param draft_id Primary key of the draft within the tenant.
 * @param overrides Fields to replace.
 * @returns A complete draft that was never sent.
 */
export function make_contract_draft(
  tenant_id: string,
  draft_id: string,
  overrides: Partial<IStoredEmailDraft> = {},
): IStoredEmailDraft {
  return {
    tenant_id,
    draft_id,
    subject: `Games ${draft_id}`,
    intro: null,
    filters: make_contract_filters(),
    include_quick_link: true,
    quick_link_expiry_days: 14,
    recipient_mode: RecipientMode.ALL_CONSENTED,
    contact_ids: [],
    status: DraftStatus.DRAFT,
    quick_link_id: null,
    recipient_count: null,
    sent_at: null,
    created_at: 1000,
    created_by: 'creator',
    updated_at: 1000,
    updated_by: 'creator',
    ...overrides,
  };
}
