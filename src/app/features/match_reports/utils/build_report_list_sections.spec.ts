import { GameStatus } from '../../games/enums/game_status.enum';
import { make_game_view } from '../../games/mocks/game_view.mock';
import { ReportStatus } from '../enums/report_status.enum';
import { make_summary } from '../mocks/match_report.mock';
import { build_report_list_sections } from './build_report_list_sections';

const NOW = Date.UTC(2026, 9, 10, 18, 0, 0);
const HOUR = 3_600_000;

const OLDER = make_game_view({ game_id: 'older', start_at: NOW - 30 * HOUR });
const NEWER = make_game_view({ game_id: 'newer', start_at: NOW - 3 * HOUR });
const HAS_DRAFT = make_game_view({ game_id: 'draft', start_at: NOW - 10 * HOUR });
const HAS_READY = make_game_view({ game_id: 'ready', start_at: NOW - 20 * HOUR });

describe('build_report_list_sections', () => {
  it('lists games with no report, or a draft, under "needs a report", most recent first', () => {
    const sections = build_report_list_sections(
      [OLDER, NEWER, HAS_DRAFT],
      [make_summary({ report_id: 'r-draft', game_id: 'draft', status: ReportStatus.DRAFT })],
      NOW,
    );

    expect(sections.needs_report.map((entry) => entry.game.game_id)).toEqual([
      'newer',
      'draft',
      'older',
    ]);
    expect(sections.needs_report.find((entry) => entry.game.game_id === 'draft')?.report).toEqual(
      expect.objectContaining({ report_id: 'r-draft' }),
    );
    expect(sections.needs_report[0].report).toBeNull();
    expect(sections.reported).toEqual([]);
  });

  it('lists a game whose report is finished under "reported"', () => {
    const sections = build_report_list_sections(
      [NEWER, HAS_READY],
      [
        make_summary({
          game_id: 'ready',
          status: ReportStatus.READY,
          home_score: 2,
          away_score: 1,
        }),
      ],
      NOW,
    );

    expect(sections.reported.map((entry) => entry.game.game_id)).toEqual(['ready']);
    expect(sections.needs_report.map((entry) => entry.game.game_id)).toEqual(['newer']);
  });

  it.each([ReportStatus.SUBMITTED, ReportStatus.NOT_SUPPORTED])(
    'counts a %s report as reported',
    (status) => {
      const sections = build_report_list_sections(
        [HAS_READY],
        [make_summary({ game_id: 'ready', status })],
        NOW,
      );

      expect(sections.reported).toHaveLength(1);
      expect(sections.needs_report).toHaveLength(0);
    },
  );

  it('leaves out games that have not started yet', () => {
    const later = make_game_view({ game_id: 'later', start_at: NOW + HOUR });

    const sections = build_report_list_sections([later, NEWER], [], NOW);

    expect(sections.needs_report.map((entry) => entry.game.game_id)).toEqual(['newer']);
  });

  it('counts a game that starts exactly now as started', () => {
    const now_game = make_game_view({ game_id: 'now', start_at: NOW });

    expect(build_report_list_sections([now_game], [], NOW).needs_report).toHaveLength(1);
  });

  it('leaves out cancelled games', () => {
    const cancelled = make_game_view({
      game_id: 'cancelled',
      start_at: NOW - HOUR,
      status: GameStatus.CANCELLED,
    });

    const sections = build_report_list_sections([cancelled], [], NOW);

    expect(sections).toEqual({ needs_report: [], reported: [] });
  });

  it('does not change the lists it was given', () => {
    const games = [OLDER, NEWER];

    build_report_list_sections(games, [], NOW);

    expect(games.map((game) => game.game_id)).toEqual(['older', 'newer']);
  });
});
