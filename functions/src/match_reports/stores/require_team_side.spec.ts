import { describe, expect, it } from 'vitest';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import { require_team_side } from './require_team_side.js';

describe('require_team_side', () => {
  it.each([TeamSide.HOME, TeamSide.AWAY])('returns %s unchanged', (side) => {
    expect(require_team_side(side)).toBe(side);
  });

  it.each([null, undefined, '', 'home', 'BOTH', 0])('refuses %j', (value) => {
    expect(() => require_team_side(value)).toThrow(/team side/);
  });
});
