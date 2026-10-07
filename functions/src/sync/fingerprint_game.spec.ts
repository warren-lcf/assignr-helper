import { describe, expect, it } from 'vitest';
import { AssignmentResponseStatus } from '../integrations/enums/assignment_response_status.enum.js';
import { fingerprint_game } from './fingerprint_game.js';
import { make_normalized_game } from './make_normalized_game.fixture.js';

describe('fingerprint_game', () => {
  it('is a 64-character hex digest and deterministic', () => {
    const game = make_normalized_game();

    expect(fingerprint_game(game)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprint_game(game)).toBe(fingerprint_game(make_normalized_game()));
  });

  it('ignores the raw payload and the endpoint-dependent flags', () => {
    const base = fingerprint_game(make_normalized_game());

    expect(fingerprint_game(make_normalized_game({ raw: { different: true } }))).toBe(base);
    expect(fingerprint_game(make_normalized_game({ is_open: false, is_mine: true }))).toBe(base);
  });

  it.each([
    ['start time', { start_at: Date.UTC(2026, 9, 11, 14, 0, 0) }],
    ['home team', { home_team: 'Eagles' }],
    ['lock version', { lock_version: 2 }],
    ['updated instant', { external_updated_at: 1 }],
    ['time zone', { game_time_zone: 'America/Chicago' }],
  ])('changes when the %s changes', (_label, overrides) => {
    expect(fingerprint_game(make_normalized_game(overrides))).not.toBe(
      fingerprint_game(make_normalized_game()),
    );
  });

  it('changes when a slot is filled or answered', () => {
    const open = make_normalized_game();
    const filled = make_normalized_game({
      slots: [
        {
          ...open.slots[0],
          assignee_name: 'Alex Referee',
          assignment_external_id: '8001',
          response_status: AssignmentResponseStatus.ACCEPTED,
        },
      ],
    });

    expect(fingerprint_game(filled)).not.toBe(fingerprint_game(open));
  });

  it('changes when the venue changes', () => {
    const moved = make_normalized_game({
      venue: { ...make_normalized_game().venue!, name: 'Oak Hill Complex Field 1' },
    });

    expect(fingerprint_game(moved)).not.toBe(fingerprint_game(make_normalized_game()));
  });
});
