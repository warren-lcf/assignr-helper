import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../../enums/assignment_response_status.enum.js';
import { GameStatus } from '../../enums/game_status.enum.js';
import { load_fixture } from '../fixtures/load_fixture.js';
import { IMapGameOptions } from './map_game_options.model.js';
import { map_assignr_game } from './map_assignr_game.js';

const options: IMapGameOptions = {
  my_user_ids: new Set(['9001', '9002']),
  fallback_site_id: null,
  assume_mine: false,
  force_open: null,
};

describe('map_assignr_game', () => {
  it('maps an assigned game with venue, slots and my assignment', () => {
    const game = map_assignr_game(load_fixture('game_assigned.json'), options);

    expect(game.external_id).toBe('5001');
    expect(game.organization_external_id).toBe('101');
    expect(game.start_at).toBe(Date.UTC(2026, 9, 11, 13, 0, 0));
    expect(game.end_at).toBe(Date.UTC(2026, 9, 11, 14, 15, 0));
    expect(game.game_time_zone).toBe('America/New_York');
    expect(game.status).toBe(GameStatus.SCHEDULED);
    expect(game.league).toBe('Fall Recreational');
    expect(game.age_group).toBe('U12');
    expect(game.home_team).toBe('Hawks');
    expect(game.away_team).toBe('Falcons');
    expect(game.venue).toMatchObject({
      external_id: '77',
      name: 'Riverside Park Field 3',
      address_line: '100 River Rd',
      city: 'Springfield',
      region: 'VA',
      postal_code: '22150',
      time_zone: 'America/New_York',
    });
    expect(game.lock_version).toBe(3);
    expect(game.external_updated_at).toBe(Date.parse('2026-10-05T18:30:00.000Z'));
    expect(game.is_mine).toBe(true);
    expect(game.is_open).toBe(true);
    expect(game.slots).toHaveLength(3);
    expect(game.slots[0]).toMatchObject({
      position: 'Referee',
      assignee_name: 'Alex Referee',
      assignment_external_id: '8001',
      response_status: AssignmentResponseStatus.UNRESPONDED,
      is_mine: true,
      lock_version: 1,
    });
    expect(game.slots[0].fees).toHaveLength(1);
    expect(game.slots[1]).toMatchObject({
      assignee_name: 'Sam Linesman',
      response_status: AssignmentResponseStatus.ACCEPTED,
      is_mine: false,
    });
    expect(game.slots[2]).toMatchObject({ assignee_name: null, assignment_external_id: null });
  });

  it('keeps the untouched provider payload', () => {
    const payload = load_fixture('game_assigned.json');

    expect(map_assignr_game(payload, options).raw).toBe(payload);
  });

  it('maps unassigned games as open and cancelled games as not open', () => {
    const list = (load_fixture('games_unassigned.json') as { _embedded: { games: unknown[] } })
      ._embedded.games;
    const open = map_assignr_game(list[0], {
      ...options,
      force_open: true,
      fallback_site_id: '101',
    });
    const cancelled = map_assignr_game(list[1], {
      ...options,
      force_open: true,
      fallback_site_id: '101',
    });

    expect(open.is_open).toBe(true);
    expect(open.is_mine).toBe(false);
    expect(open.organization_external_id).toBe('101');
    expect(open.game_type).toBe('League');
    expect(cancelled.status).toBe(GameStatus.CANCELLED);
    expect(cancelled.is_open).toBe(false);
  });

  it('treats a status of Cancelled as cancelled even without the flag', () => {
    const game = map_assignr_game(
      { id: 1, start_time: '2026-10-11T09:00:00Z', status: 'Cancelled' },
      options,
    );

    expect(game.status).toBe(GameStatus.CANCELLED);
  });

  it('marks everything mine when the endpoint only returns my games', () => {
    const game = map_assignr_game(
      { id: 1, start_time: '2026-10-11T09:00:00Z' },
      { ...options, assume_mine: true, force_open: false },
    );

    expect(game.is_mine).toBe(true);
    expect(game.is_open).toBe(false);
  });

  it('maps declined assignments and falls back through name sources', () => {
    const game = map_assignr_game(
      {
        id: 2,
        start_time: '2026-10-11T09:00:00Z',
        time_zone: 'America/Chicago',
        _embedded: {
          assignments: [
            {
              id: 1,
              position_abbreviation: 'AR1',
              declined: true,
              _embedded: { official: { id: 5, name: 'Pat Official' } },
            },
            { id: 2, position_id: 9, _embedded: { official: { id: 6 } } },
          ],
        },
      },
      options,
    );

    expect(game.game_time_zone).toBe('America/Chicago');
    expect(game.slots[0]).toMatchObject({
      position: 'AR1',
      assignee_name: 'Pat Official',
      response_status: AssignmentResponseStatus.DECLINED,
    });
    expect(game.slots[1].position).toBe('9');
    expect(game.slots[1].assignee_name).toBeNull();
    expect(game.organization_external_id).toBe('');
  });

  it('uses the venue time zone when the game has none', () => {
    const game = map_assignr_game(
      {
        id: 3,
        start_time: '2026-10-11T09:00:00Z',
        _embedded: { venue: { id: 1, name: 'V', timezone: 'America/Denver' } },
      },
      options,
    );

    expect(game.game_time_zone).toBe('America/Denver');
  });

  it('rejects a payload without an id and one with a bad start time', () => {
    expect(() => map_assignr_game({ start_time: '2026-10-11T09:00:00Z' }, options)).toThrow();
    expect(() => map_assignr_game({ id: 4, start_time: 'garbage' }, options)).toThrow(
      /unparseable start_time/,
    );
  });
});
