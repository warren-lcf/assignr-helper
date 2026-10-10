import { IStoredOrganization } from '../../sync/models/stored_organization.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';

/**
 * Builds a stored venue with a full address for specs.
 * @param overrides Fields to replace.
 * @returns A venue.
 */
export function make_calendar_venue(overrides: Partial<IStoredVenue> = {}): IStoredVenue {
  return {
    tenant_id: 't1',
    venue_id: 'v1',
    connection_id: 'c1',
    external_id: 'ext-v1',
    name: 'Riverside Park',
    address_line: '12 Main St',
    city: 'Leesburg',
    region: 'VA',
    postal_code: '20176',
    latitude: null,
    longitude: null,
    time_zone: 'America/New_York',
    location_group: null,
    created_at: 1,
    created_by: 'a',
    updated_at: 1,
    updated_by: 'a',
    ...overrides,
  };
}

/**
 * Builds a stored organization (an assignor) for specs.
 * @param overrides Fields to replace.
 * @returns An organization.
 */
export function make_calendar_organization(
  overrides: Partial<IStoredOrganization> = {},
): IStoredOrganization {
  return {
    tenant_id: 't1',
    organization_id: 'org-1',
    connection_id: 'c1',
    external_id: 'ext-org-1',
    name: 'Metro Soccer',
    flags: {},
    sync_enabled: true,
    created_at: 1,
    created_by: 'a',
    updated_at: 1,
    updated_by: 'a',
    ...overrides,
  };
}
