import { IncidentType } from '../enums/incident_type.enum';
import { TeamSide } from '../enums/team_side.enum';
import { make_incident } from '../mocks/match_report.mock';
import { count_cards, has_no_cards } from './count_cards';

const INCIDENTS = [
  make_incident({ incident_id: '1', team_side: TeamSide.HOME, incident_type: IncidentType.YELLOW }),
  make_incident({ incident_id: '2', team_side: TeamSide.HOME, incident_type: IncidentType.YELLOW }),
  make_incident({
    incident_id: '3',
    team_side: TeamSide.HOME,
    incident_type: IncidentType.SECOND_YELLOW,
  }),
  make_incident({ incident_id: '4', team_side: TeamSide.AWAY, incident_type: IncidentType.RED }),
  make_incident({ incident_id: '5', team_side: TeamSide.AWAY, incident_type: IncidentType.OTHER }),
];

describe('count_cards', () => {
  it('counts each kind of card for the home team', () => {
    expect(count_cards(INCIDENTS, TeamSide.HOME)).toEqual({
      yellow: 2,
      second_yellow: 1,
      red: 0,
    });
  });

  it('counts only the away team’s cards for the away team, ignoring other incidents', () => {
    expect(count_cards(INCIDENTS, TeamSide.AWAY)).toEqual({ yellow: 0, second_yellow: 0, red: 1 });
  });

  it('is all zeros with no incidents', () => {
    expect(count_cards([], TeamSide.HOME)).toEqual({ yellow: 0, second_yellow: 0, red: 0 });
  });
});

describe('has_no_cards', () => {
  it('is true only when every count is zero', () => {
    expect(has_no_cards({ yellow: 0, second_yellow: 0, red: 0 })).toBe(true);
    expect(has_no_cards({ yellow: 0, second_yellow: 1, red: 0 })).toBe(false);
    expect(has_no_cards({ yellow: 0, second_yellow: 0, red: 3 })).toBe(false);
  });
});
