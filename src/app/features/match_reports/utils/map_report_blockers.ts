import { IApiViolation } from '../../connections/models/api_violation.model';
import { IIncidentView } from '../models/incident_view.model';
import { IReportBlocker } from '../models/report_blocker.model';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** What the blocker sentences need to name: the teams, and the cards so a card can be called "Card 2". */
export interface IBlockerContext {
  home_name: string;
  away_name: string;
  incidents: readonly IIncidentView[];
}

/** Matches `incidents[<id>].<field>`. */
const INCIDENT_PATH = /^incidents\[(.+)\]\.([a-z_]+)$/;

/**
 * Words one field path from a REPORT_NOT_READY answer as something the referee can act on. The server's
 * own English wording is never shown.
 * @param violation The path and message the server gave.
 * @param context The teams and cards, to name them.
 * @param translate Translates an English key.
 * @returns The blocker, with a translated sentence.
 */
export function map_report_blocker(
  violation: IApiViolation,
  context: IBlockerContext,
  translate: Translate,
): IReportBlocker {
  const path = violation.path;
  if (path === 'home_score') {
    return {
      path,
      message: translate('Enter the final score for {{team}}.', { team: context.home_name }),
    };
  }
  if (path === 'away_score') {
    return {
      path,
      message: translate('Enter the final score for {{team}}.', { team: context.away_name }),
    };
  }
  const match = INCIDENT_PATH.exec(path);
  if (match) {
    const index = context.incidents.findIndex(
      (incident) => incident.incident_id === match[1] || incident.idempotency_key === match[1],
    );
    const number = index >= 0 ? index + 1 : null;
    const card = number === null ? translate('A card') : translate('Card {{number}}', { number });
    switch (match[2]) {
      case 'team_side':
        return { path, message: translate('{{card}} needs a team.', { card }) };
      case 'incident_type':
        return { path, message: translate('{{card}} needs a card type.', { card }) };
      case 'jersey_number':
        return {
          path,
          message: translate('{{card}} needs a player number from 0 to 99.', { card }),
        };
      case 'minute':
        return { path, message: translate('{{card}} needs a minute from 0 to 130.', { card }) };
    }
  }
  return { path, message: translate('Something in the report needs attention.') };
}

/**
 * Words every blocker of a REPORT_NOT_READY answer.
 * @param violations The paths and messages the server gave.
 * @param context The teams and cards, to name them.
 * @param translate Translates an English key.
 * @returns One blocker per violation, in the order given.
 */
export function map_report_blockers(
  violations: readonly IApiViolation[],
  context: IBlockerContext,
  translate: Translate,
): IReportBlocker[] {
  return violations.map((violation) => map_report_blocker(violation, context, translate));
}
