import { IncidentType } from './incident_type.enum.js';
import { IMatchReport } from './match_report.model.js';
import { ReadyBlocker } from './ready_blocker.enum.js';
import { IReadyCheck } from './ready_check.model.js';
import { ScoreValidationCode } from './score_validation_code.enum.js';
import { validate_score } from './validate_score.js';

/**
 * Checks whether a report can be marked READY: both scores must be present and
 * valid, and every card (yellow, second yellow, red) must have a team side.
 * @param report The report to check.
 * @returns `ready` plus every blocker found, in a stable order.
 */
export function can_mark_ready(report: IMatchReport): IReadyCheck {
  const blockers: ReadyBlocker[] = [];

  const home = validate_score(report.home_score);
  if (!home.valid) {
    blockers.push(
      home.code === ScoreValidationCode.MISSING
        ? ReadyBlocker.HOME_SCORE_MISSING
        : ReadyBlocker.HOME_SCORE_INVALID,
    );
  }
  const away = validate_score(report.away_score);
  if (!away.valid) {
    blockers.push(
      away.code === ScoreValidationCode.MISSING
        ? ReadyBlocker.AWAY_SCORE_MISSING
        : ReadyBlocker.AWAY_SCORE_INVALID,
    );
  }
  if (
    report.incidents.some(
      (incident) => incident.incident_type !== IncidentType.OTHER && incident.team_side === null,
    )
  ) {
    blockers.push(ReadyBlocker.CARD_MISSING_TEAM_SIDE);
  }

  return { ready: blockers.length === 0, blockers };
}
