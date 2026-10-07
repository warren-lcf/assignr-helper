import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { make_contract_game } from '../../sync/stores/contracts/make_contract_game.js';
import { to_quick_link_game_source } from './to_quick_link_game_source.js';

const VENUE: IStoredVenue = {
  tenant_id: 't1',
  venue_id: 'v1',
  connection_id: 'c1',
  external_id: 'ev1',
  name: 'Field 1',
  address_line: '1 Secret Street',
  city: null,
  region: null,
  postal_code: null,
  latitude: null,
  longitude: null,
  time_zone: null,
  location_group: 'North Complex',
  created_at: 1,
  created_by: 'a',
  updated_at: 1,
  updated_by: 'a',
};

describe('to_quick_link_game_source', () => {
  it('copies the game and its venue labels', () => {
    const game = make_contract_game('t1', 'g1', {
      organization_id: 'org-7',
      status: GameStatus.CANCELLED,
      is_open: true,
      start_at: 5000,
      local_date: 4000,
      level: 'U12',
      league: 'Spring',
      home_team: 'Hawks',
      away_team: 'Eagles',
    });

    expect(to_quick_link_game_source(game, VENUE)).toMatchObject({
      game_id: 'g1',
      organization_id: 'org-7',
      status: GameStatus.CANCELLED,
      is_open: true,
      start_at: 5000,
      local_date: 4000,
      venue_name: 'Field 1',
      location_group: 'North Complex',
      level: 'U12',
      league: 'Spring',
      home_team: 'Hawks',
      away_team: 'Eagles',
    });
  });

  it('has no venue labels without a venue', () => {
    const source = to_quick_link_game_source(make_contract_game('t1', 'g1'), null);

    expect(source.venue_name).toBeNull();
    expect(source.location_group).toBeNull();
  });

  it('counts a position as open only while no assignment is recorded for it', () => {
    const base = make_contract_game('t1', 'g1');
    const slot = base.slots[0]!;
    const game = {
      ...base,
      slots: [
        slot,
        { ...slot, slot_id: 'slot_2', assignment_external_id: 'a-1' },
        {
          ...slot,
          slot_id: 'slot_3',
          assignment_external_id: 'a-2',
          response_status: AssignmentResponseStatus.ACCEPTED,
        },
      ],
    };

    expect(to_quick_link_game_source(game, null).open_slot_count).toBe(1);
  });

  it('leaves out every private field and every fee', () => {
    const game = make_contract_game('t1', 'g1', { raw: { secret: 'payload' } });
    game.slots[0] = { ...game.slots[0]!, assignee_name: 'Pat Referee', fees: [{ amount: 55 }] };

    const source = to_quick_link_game_source(game, VENUE);

    expect(source.assignee_names).toEqual([]);
    expect(source.raw_json).toBeNull();
    expect(source.organization_name).toBe('');
    expect(source.fee_minor).toBeNull();
    expect(source.currency).toBeNull();
    expect(JSON.stringify(source)).not.toContain('Pat Referee');
    expect(JSON.stringify(source)).not.toContain('payload');
    expect(JSON.stringify(source)).not.toContain('Secret Street');
  });
});
