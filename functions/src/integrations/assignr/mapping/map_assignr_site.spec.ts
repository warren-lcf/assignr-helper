import { describe, expect, it } from 'vitest';
import { load_fixture } from '../fixtures/load_fixture.js';
import { map_assignr_site } from './map_assignr_site.js';

describe('map_assignr_site', () => {
  it('maps id, name and boolean visibility flags', () => {
    const sites = (load_fixture('sites.json') as { _embedded: { sites: unknown[] } })._embedded
      .sites;

    expect(map_assignr_site(sites[0])).toEqual({
      external_id: '101',
      name: 'Metro Youth Soccer Assignor',
      flags: { show_all_games: true, show_unassigned_games: true, forms_enabled: false },
    });
  });

  it('rejects a site without a name', () => {
    expect(() => map_assignr_site({ id: 1 })).toThrow();
  });
});
