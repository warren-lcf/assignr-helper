import { ICardCounts } from './card_counts.model.js';
import { ICardSummary } from './card_summary.model.js';
import { IncidentType } from './incident_type.enum.js';
import { IMatchReport } from './match_report.model.js';
import { TeamSide } from './team_side.enum.js';

/**
 * Creates a zeroed tally.
 * @returns Counts with every type at zero.
 */
function empty_counts(): ICardCounts {
  return { yellow: 0, second_yellow: 0, red: 0 };
}

/**
 * Counts cards per team side and type. A second yellow is reported as its own
 * count and is never converted into a yellow plus a red. Non-card incidents are
 * ignored, and cards without a team side go to `unassigned`.
 * @param report The report to summarise.
 * @returns Card tallies for home, away and unassigned.
 */
export function summarize_cards(report: IMatchReport): ICardSummary {
  const summary: ICardSummary = {
    home: empty_counts(),
    away: empty_counts(),
    unassigned: empty_counts(),
  };

  for (const incident of report.incidents) {
    const counts =
      incident.team_side === TeamSide.HOME
        ? summary.home
        : incident.team_side === TeamSide.AWAY
          ? summary.away
          : summary.unassigned;
    if (incident.incident_type === IncidentType.YELLOW) {
      counts.yellow += 1;
    } else if (incident.incident_type === IncidentType.SECOND_YELLOW) {
      counts.second_yellow += 1;
    } else if (incident.incident_type === IncidentType.RED) {
      counts.red += 1;
    }
  }

  return summary;
}
