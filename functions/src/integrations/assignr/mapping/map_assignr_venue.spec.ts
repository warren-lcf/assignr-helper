import { describe, expect, it } from 'vitest';
import { assignr_venue_schema } from '../schemas/assignr_venue.schema.js';
import { map_assignr_venue } from './map_assignr_venue.js';

describe('map_assignr_venue', () => {
  it('accepts alternate address spellings and numeric zips', () => {
    const venue = map_assignr_venue(
      assignr_venue_schema.parse({
        id: 5,
        name: ' Field 9 ',
        address1: '1 Main St',
        postal_code: 22150,
        latitude: 1.5,
        longitude: 2.5,
      }),
    );

    expect(venue).toEqual({
      external_id: '5',
      name: 'Field 9',
      address_line: '1 Main St',
      city: null,
      region: null,
      postal_code: '22150',
      latitude: 1.5,
      longitude: 2.5,
      time_zone: null,
    });
  });

  it('nulls blank text fields', () => {
    const venue = map_assignr_venue(
      assignr_venue_schema.parse({ id: 6, name: 'V', city: '   ', timezone: '' }),
    );

    expect(venue.city).toBeNull();
    expect(venue.time_zone).toBeNull();
  });
});
