import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../integrations/enums/assignment_response_status.enum.js';
import { GameStatus } from '../../integrations/enums/game_status.enum.js';
import { IStoredGameSlot } from '../../sync/models/stored_game_slot.model.js';
import { IStoredOrganization } from '../../sync/models/stored_organization.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { make_contract_game } from '../../sync/stores/contracts/make_contract_game.js';
import { GameSlotState } from './game_slot_state.enum.js';
import { to_game_view } from './to_game_view.js';

const venue: IStoredVenue = {
  tenant_id: 't1',
  venue_id: 'v1',
  connection_id: 'c1',
  external_id: 'ext-v1',
  name: 'Field 1',
  address_line: '1 Main St',
  city: 'Leesburg',
  region: 'VA',
  postal_code: '20175',
  latitude: 39.1,
  longitude: -77.5,
  time_zone: 'America/New_York',
  location_group: 'North Complex',
  created_at: 1,
  created_by: 'a',
  updated_at: 1,
  updated_by: 'a',
};

const organization: IStoredOrganization = {
  tenant_id: 't1',
  organization_id: 'org-1',
  connection_id: 'c1',
  external_id: '101',
  name: 'Metro Soccer',
  flags: {},
  sync_enabled: true,
  created_at: 1,
  created_by: 'a',
  updated_at: 1,
  updated_by: 'a',
};

/**
 * Builds a slot.
 * @param overrides Fields to replace.
 * @returns An unfilled referee slot.
 */
function make_slot(overrides: Partial<IStoredGameSlot> = {}): IStoredGameSlot {
  return {
    slot_id: 'slot_0',
    position: 'Referee',
    assignee_name: null,
    assignment_external_id: null,
    response_status: AssignmentResponseStatus.UNRESPONDED,
    is_mine: false,
    lock_version: null,
    fees: [{ amount: 55 }],
    ...overrides,
  };
}

describe('to_game_view', () => {
  it('projects a stored game with its venue and organization names', () => {
    const game = make_contract_game('t1', 'g1', {
      connection_id: 'c1',
      organization_id: 'org-1',
      venue_id: 'v1',
      start_at: 1786234975000,
      end_at: 1786242175000,
      local_date: 1786147200000,
      status: GameStatus.CANCELLED,
      league: 'Metro League',
      level: 'Premier',
      age_group: 'U12',
      game_type: 'League',
      gender: 'Boys',
      home_team: 'Home FC',
      away_team: 'Away SC',
      is_open: false,
      is_mine: true,
      slots: [make_slot()],
    });

    expect(to_game_view(game, venue, organization)).toEqual({
      game_id: 'g1',
      connection_id: 'c1',
      organization_id: 'org-1',
      organization_name: 'Metro Soccer',
      venue_name: 'Field 1',
      location_group: 'North Complex',
      local_date: 1786147200000,
      time_zone: 'America/New_York',
      start_at: 1786234975000,
      end_at: 1786242175000,
      status: GameStatus.CANCELLED,
      level: 'Premier',
      league: 'Metro League',
      age_group: 'U12',
      game_type: 'League',
      gender: 'Boys',
      home_team: 'Home FC',
      away_team: 'Away SC',
      is_open: false,
      is_mine: true,
      open_slot_count: 1,
      open_positions: ['Referee'],
      slots: [{ position: 'Referee', state: GameSlotState.OPEN }],
      total_slot_count: 1,
      my_position: null,
      fee_minor: null,
      currency: null,
    });
  });

  it('leaves venue fields null and the organization name empty when they are unknown', () => {
    const view = to_game_view(make_contract_game('t1', 'g1'), null, null);

    expect(view).toMatchObject({ venue_name: null, location_group: null, organization_name: '' });
  });

  it('counts positions with no recorded assignment as open', () => {
    const game = make_contract_game('t1', 'g1', {
      slots: [
        make_slot({ slot_id: 'slot_0' }),
        make_slot({
          slot_id: 'slot_1',
          position: 'Assistant Referee',
          assignee_name: 'Pat Doe',
          assignment_external_id: 'asg-1',
        }),
        make_slot({ slot_id: 'slot_2', position: 'Fourth Official' }),
      ],
    });

    const view = to_game_view(game, null, null);

    expect(view.open_slot_count).toBe(2);
    expect(view.total_slot_count).toBe(3);
  });

  it('reports zero positions for a game with no slots', () => {
    const view = to_game_view(make_contract_game('t1', 'g1', { slots: [] }), null, null);

    expect(view).toMatchObject({ open_slot_count: 0, total_slot_count: 0, my_position: null });
  });

  it('reports the position held by the connected account', () => {
    const game = make_contract_game('t1', 'g1', {
      slots: [
        make_slot({ slot_id: 'slot_0', position: 'Referee', assignment_external_id: 'asg-1' }),
        make_slot({
          slot_id: 'slot_1',
          position: 'Assistant Referee',
          assignment_external_id: 'asg-2',
          is_mine: true,
        }),
      ],
    });

    expect(to_game_view(game, null, null).my_position).toBe('Assistant Referee');
  });

  it('never exposes the raw payload, assignee names or fees', () => {
    const game = make_contract_game('t1', 'g1', {
      raw: { secret: 'payload' },
      slots: [make_slot({ assignee_name: 'Pat Doe', assignment_external_id: 'asg-1' })],
    });

    const serialized = JSON.stringify(to_game_view(game, venue, organization));

    expect(serialized).not.toContain('payload');
    expect(serialized).not.toContain('Pat Doe');
    expect(serialized).not.toContain('asg-1');
    expect(serialized).not.toContain('"raw"');
    expect(serialized).not.toContain('fees');
  });

  it("names every position and says whether it is open, filled or the account's own", () => {
    const game = make_contract_game('t1', 'g1', {
      slots: [
        make_slot({ slot_id: 'slot_0', position: ' Referee ' }),
        make_slot({
          slot_id: 'slot_1',
          position: 'Asst. Referee',
          assignment_external_id: 'asg-1',
          assignee_name: 'Pat Secret',
        }),
        make_slot({
          slot_id: 'slot_2',
          position: 'Asst. Referee',
          assignment_external_id: 'asg-2',
          is_mine: true,
        }),
        make_slot({ slot_id: 'slot_3', position: 'Mentor' }),
      ],
    });

    const view = to_game_view(game, null, null);

    expect(view.slots).toEqual([
      { position: 'Referee', state: GameSlotState.OPEN },
      { position: 'Asst. Referee', state: GameSlotState.FILLED },
      { position: 'Asst. Referee', state: GameSlotState.MINE },
      { position: 'Mentor', state: GameSlotState.OPEN },
    ]);
    expect(view.open_positions).toEqual(['Referee', 'Mentor']);
    expect(view.open_slot_count).toBe(2);
    expect(view.total_slot_count).toBe(4);
    expect(JSON.stringify(view)).not.toContain('Pat Secret');
  });

  it('keeps an unnamed position as an empty name so the screen can label it', () => {
    const game = make_contract_game('t1', 'g1', { slots: [make_slot({ position: '  ' })] });

    expect(to_game_view(game, null, null).slots).toEqual([
      { position: '', state: GameSlotState.OPEN },
    ]);
  });

  it('takes the time zone from the game, else its venue, and drops a name that is not a real zone', () => {
    const own = make_contract_game('t1', 'g1', { game_time_zone: 'America/Los_Angeles' });
    const none = make_contract_game('t1', 'g2', { game_time_zone: null });
    const bad = make_contract_game('t1', 'g3', { game_time_zone: 'Central Time' });

    expect(to_game_view(own, venue, null).time_zone).toBe('America/Los_Angeles');
    expect(to_game_view(none, venue, null).time_zone).toBe('America/New_York');
    expect(to_game_view(none, null, null).time_zone).toBeNull();
    expect(to_game_view(bad, venue, null).time_zone).toBe('America/New_York');
    expect(to_game_view(bad, { ...venue, time_zone: 'Nope/Zone' }, null).time_zone).toBeNull();
  });
});
