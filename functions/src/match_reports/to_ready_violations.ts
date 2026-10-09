import { IncidentType } from '../domain/match_reports/incident_type.enum.js';
import { IMatchReport } from '../domain/match_reports/match_report.model.js';
import { ReadyBlocker } from '../domain/match_reports/ready_blocker.enum.js';
import { IViolation } from '../http/models/violation.model.js';

/**
 * Turns the blockers found by `can_mark_ready` into API violations. The `path` is a stable
 * machine code a client can act on: `home_score`, `away_score`, or `incidents[<incident_id>].team_side`
 * for each card that has no team side. The message is for people and never repeats request data.
 * @param report The report that was checked.
 * @param blockers The blockers `can_mark_ready` returned for it.
 * @returns One violation per blocker, and one per offending card for a missing team side, in the
 *   order the blockers were found.
 */
export function to_ready_violations(report: IMatchReport, blockers: ReadyBlocker[]): IViolation[] {
  return blockers.flatMap((blocker): IViolation[] => {
    switch (blocker) {
      case ReadyBlocker.HOME_SCORE_MISSING:
        return [{ path: 'home_score', message: 'The home score is missing' }];
      case ReadyBlocker.HOME_SCORE_INVALID:
        return [
          { path: 'home_score', message: 'The home score is not a whole number from 0 to 99' },
        ];
      case ReadyBlocker.AWAY_SCORE_MISSING:
        return [{ path: 'away_score', message: 'The away score is missing' }];
      case ReadyBlocker.AWAY_SCORE_INVALID:
        return [
          { path: 'away_score', message: 'The away score is not a whole number from 0 to 99' },
        ];
      case ReadyBlocker.CARD_MISSING_TEAM_SIDE:
        return report.incidents
          .filter(
            (incident) =>
              incident.incident_type !== IncidentType.OTHER && incident.team_side === null,
          )
          .map((incident) => ({
            path: `incidents[${incident.incident_id}].team_side`,
            message: 'This card needs a team',
          }));
    }
  });
}
