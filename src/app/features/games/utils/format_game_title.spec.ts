import { make_translation_service_double } from '../mocks/translation_service.mock';
import { format_game_title } from './format_game_title';

const translate = make_translation_service_double().translate;

describe('format_game_title', () => {
  it('joins the teams with "vs"', () => {
    expect(format_game_title({ home_team: 'Lions', away_team: 'Tigers' }, translate)).toBe(
      'Lions vs Tigers',
    );
  });

  it('says "To be announced" for a missing side', () => {
    expect(format_game_title({ home_team: 'Lions', away_team: null }, translate)).toBe(
      'Lions vs To be announced',
    );
    expect(format_game_title({ home_team: ' ', away_team: 'Tigers' }, translate)).toBe(
      'To be announced vs Tigers',
    );
  });

  it('says "Teams to be announced" when both are missing', () => {
    expect(format_game_title({ home_team: null, away_team: null }, translate)).toBe(
      'Teams to be announced',
    );
  });
});
