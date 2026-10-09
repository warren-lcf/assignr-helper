import { IncidentType } from '../enums/incident_type.enum';
import { TeamSide } from '../enums/team_side.enum';
import { IIncidentView } from '../models/incident_view.model';
import { ITeamCardCounts } from '../models/team_card_counts.model';

/**
 * Counts the cards shown to one team.
 * @param incidents Every incident on the report.
 * @param side The team to count for.
 * @returns How many yellow, second yellow and red cards that team has.
 */
export function count_cards(incidents: readonly IIncidentView[], side: TeamSide): ITeamCardCounts {
  const own = incidents.filter((incident) => incident.team_side === side);
  const count_of = (type: IncidentType): number =>
    own.filter((incident) => incident.incident_type === type).length;
  return {
    yellow: count_of(IncidentType.YELLOW),
    second_yellow: count_of(IncidentType.SECOND_YELLOW),
    red: count_of(IncidentType.RED),
  };
}

/**
 * Whether a team has no cards at all.
 * @param counts The team's counts.
 * @returns True when every count is zero.
 */
export function has_no_cards(counts: ITeamCardCounts): boolean {
  return counts.yellow + counts.second_yellow + counts.red === 0;
}
