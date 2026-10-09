import { make_incident } from '../mocks/match_report.mock';
import { IBlockerContext, map_report_blocker, map_report_blockers } from './map_report_blockers';

const translate = (key: string, params?: Record<string, string | number>): string =>
  params ? key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name])) : key;

const CONTEXT: IBlockerContext = {
  home_name: 'Lions',
  away_name: 'Tigers',
  incidents: [
    make_incident({ incident_id: 'inc-1', idempotency_key: 'key-a' }),
    make_incident({ incident_id: 'inc-2', idempotency_key: 'key-b' }),
  ],
};

describe('map_report_blocker', () => {
  it('asks for the home score by team name', () => {
    expect(map_report_blocker({ path: 'home_score', message: 'x' }, CONTEXT, translate)).toEqual({
      path: 'home_score',
      message: 'Enter the final score for Lions.',
    });
  });

  it('asks for the away score by team name', () => {
    expect(
      map_report_blocker({ path: 'away_score', message: 'x' }, CONTEXT, translate).message,
    ).toBe('Enter the final score for Tigers.');
  });

  it.each([
    ['team_side', 'Card 2 needs a team.'],
    ['incident_type', 'Card 2 needs a card type.'],
    ['jersey_number', 'Card 2 needs a player number from 0 to 99.'],
    ['minute', 'Card 2 needs a minute from 0 to 130.'],
  ])(
    'words an incident’s %s problem, numbering the card by its place on the report',
    (field, text) => {
      const violation = { path: `incidents[inc-2].${field}`, message: 'English' };

      expect(map_report_blocker(violation, CONTEXT, translate)).toEqual({
        path: violation.path,
        message: text,
      });
    },
  );

  it('finds the card by its idempotency key too', () => {
    const violation = { path: 'incidents[key-a].team_side', message: 'English' };

    expect(map_report_blocker(violation, CONTEXT, translate).message).toBe('Card 1 needs a team.');
  });

  it('says "A card" when the card is not on the report', () => {
    const violation = { path: 'incidents[ghost].team_side', message: 'English' };

    expect(map_report_blocker(violation, CONTEXT, translate).message).toBe('A card needs a team.');
  });

  it('falls back to a plain sentence for a field it does not know, never the server’s wording', () => {
    const blocker = map_report_blocker(
      { path: 'incidents[inc-1].colour', message: 'Server English' },
      CONTEXT,
      translate,
    );

    expect(blocker.message).toBe('Something in the report needs attention.');
    expect(
      map_report_blocker({ path: 'other', message: 'Server English' }, CONTEXT, translate).message,
    ).toBe('Something in the report needs attention.');
  });
});

describe('map_report_blockers', () => {
  it('words every violation in order', () => {
    const blockers = map_report_blockers(
      [
        { path: 'home_score', message: 'a' },
        { path: 'away_score', message: 'b' },
      ],
      CONTEXT,
      translate,
    );

    expect(blockers.map((blocker) => blocker.path)).toEqual(['home_score', 'away_score']);
  });

  it('is empty when there are no violations', () => {
    expect(map_report_blockers([], CONTEXT, translate)).toEqual([]);
  });
});
