import { TeamSide } from '../../domain/match_reports/team_side.enum.js';

/**
 * Checks that an incident about to be stored has a real team side. The domain model allows a null
 * side, the column is NOT NULL, and the API always requires one, so a stored incident must never
 * be without. This guards the store against callers that bypass the types.
 * @param team_side The side about to be written.
 * @returns The side, narrowed to a real team.
 * @throws Error when the value is not HOME or AWAY.
 */
export function require_team_side(team_side: unknown): TeamSide {
  if (team_side !== TeamSide.HOME && team_side !== TeamSide.AWAY) {
    throw new Error('An incident needs a team side (HOME or AWAY) to be stored');
  }
  return team_side;
}
