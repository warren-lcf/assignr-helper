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

  it('reads coordinates sent as strings, as the live API does', () => {
    const venue = map_assignr_venue(
      assignr_venue_schema.parse({
        id: 7,
        name: 'V',
        latitude: '39.115467',
        longitude: ' -77.563610 ',
      }),
    );

    expect(venue.latitude).toBe(39.115467);
    expect(venue.longitude).toBe(-77.56361);
  });

  it.each([
    ['blank', ''],
    ['not a number', 'north'],
    ['out of range', '123.4'],
    ['missing', null],
  ])('treats a %s latitude as unknown without rejecting the venue', (_label, latitude) => {
    const venue = map_assignr_venue(assignr_venue_schema.parse({ id: 8, name: 'V', latitude }));

    expect(venue.latitude).toBeNull();
    expect(venue.name).toBe('V');
  });

  it('keeps a longitude of zero', () => {
    const venue = map_assignr_venue(
      assignr_venue_schema.parse({ id: 9, name: 'V', longitude: '0.0' }),
    );

    expect(venue.longitude).toBe(0);
  });
});
