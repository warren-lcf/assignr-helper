import { describe, expect, it } from 'vitest';
import { IStoredVenue } from '../sync/models/stored_venue.model.js';
import { pick_digest_time_zone } from './pick_digest_time_zone.js';

/**
 * Builds a venue with the given zone.
 * @param time_zone IANA zone or null.
 * @returns A venue.
 */
function venue(time_zone: string | null): IStoredVenue {
  return {
    tenant_id: 't1',
    venue_id: 'v',
    connection_id: 'c',
    external_id: 'e',
    name: 'Field',
    address_line: null,
    city: null,
    region: null,
    postal_code: null,
    latitude: null,
    longitude: null,
    time_zone,
    location_group: null,
    created_at: 1,
    created_by: 'a',
    updated_at: 1,
    updated_by: 'a',
  };
}

describe('pick_digest_time_zone', () => {
  it('picks the most common zone', () => {
    expect(
      pick_digest_time_zone([
        venue('America/Chicago'),
        venue('America/New_York'),
        venue('America/New_York'),
      ]),
    ).toBe('America/New_York');
  });

  it('breaks a tie by zone name so the choice is stable', () => {
    expect(pick_digest_time_zone([venue('America/New_York'), venue('America/Chicago')])).toBe(
      'America/Chicago',
    );
  });

  it('ignores blank, missing and invalid zones', () => {
    expect(
      pick_digest_time_zone([venue(null), venue(''), venue('  '), venue('Mars/Olympus')]),
    ).toBeNull();
    expect(pick_digest_time_zone([venue('Mars/Olympus'), venue('America/Denver')])).toBe(
      'America/Denver',
    );
  });

  it('has no zone for no venues', () => {
    expect(pick_digest_time_zone([])).toBeNull();
  });
});
