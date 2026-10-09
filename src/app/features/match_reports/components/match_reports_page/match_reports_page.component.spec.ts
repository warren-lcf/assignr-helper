import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GameStatus } from '../../../games/enums/game_status.enum';
import { GamesScope } from '../../../games/enums/games_scope.enum';
import { make_date_group, make_game_view } from '../../../games/mocks/game_view.mock';
import { IGameView } from '../../../games/models/game_view.model';
import { IGamesQuery } from '../../../games/models/games_query.model';
import { IGamesResult } from '../../../games/models/games_result.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { ReportStatus } from '../../enums/report_status.enum';
import { make_summary } from '../../mocks/match_report.mock';
import {
  ISessionDoubleOptions,
  READ_ONLY_PERMISSIONS,
  REFEREE_PERMISSIONS,
  WRITE_ONLY_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IMatchReportSummaryView } from '../../models/match_report_summary_view.model';
import { MatchReportsApiService } from '../../services/match_reports_api.service';
import { MatchReportsPageComponent } from './match_reports_page.component';

const NOW = Date.UTC(2026, 9, 10, 18, 0, 0);
const HOUR = 3_600_000;

function game_at(
  game_id: string,
  hours_ago: number,
  overrides: Partial<IGameView> = {},
): IGameView {
  return make_game_view({
    game_id,
    start_at: NOW - hours_ago * HOUR,
    home_team: `Home ${game_id}`,
    away_team: `Away ${game_id}`,
    is_mine: true,
    ...overrides,
  });
}

function result_of(...games: IGameView[]): IGamesResult {
  return {
    locations: games.length
      ? [{ location_label: 'Riverside Park', dates: [make_date_group(NOW, games)] }]
      : [],
    total: games.length,
    truncated: false,
  };
}

interface IRenderOptions {
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  games?: IGameView[];
  summaries?: IMatchReportSummaryView[];
  list_games?: (query: IGamesQuery) => Observable<IGamesResult>;
  list_reports?: () => Observable<IMatchReportSummaryView[]>;
}

function render(options: IRenderOptions = {}) {
  const games_api = {
    list_games: vi.fn((query: IGamesQuery) =>
      options.list_games ? options.list_games(query) : of(result_of(...(options.games ?? []))),
    ),
  };
  const reports_api = {
    list_reports: vi.fn(() =>
      options.list_reports ? options.list_reports() : of(options.summaries ?? []),
    ),
  };
  const session = make_session_service_double(
    options.permissions ?? REFEREE_PERMISSIONS,
    options.session,
  );
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    imports: [MatchReportsPageComponent],
    providers: [
      { provide: GamesApiService, useValue: games_api },
      { provide: MatchReportsApiService, useValue: reports_api },
      { provide: SessionService, useValue: session },
      { provide: Router, useValue: router },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
    ],
  });
  const fixture = TestBed.createComponent(MatchReportsPageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const row_ids = (section: string) =>
    Array.from(
      element.querySelectorAll(`[data-testid="${section}"] [data-testid^="report-row-"]`),
      (row) => row.getAttribute('data-testid'),
    );
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    games_api,
    reports_api,
    session,
    router,
    settle,
    by_testid,
    row_ids,
  };
}

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

describe('MatchReportsPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('shows skeletons while the list loads', () => {
      const pending = new Subject<IGamesResult>();
      const { by_testid, element } = render({ list_games: () => pending });

      expect(by_testid('reports-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-line').length).toBeGreaterThan(0);
      expect(by_testid('reports-needs-report')).toBeNull();
    });

    it('shows skeletons while the session loads, and asks for nothing yet', async () => {
      const { by_testid, games_api, reports_api, settle } = render({
        session: { is_loading: true },
      });
      await settle();

      expect(by_testid('reports-loading')).not.toBeNull();
      expect(games_api.list_games).not.toHaveBeenCalled();
      expect(reports_api.list_reports).not.toHaveBeenCalled();
    });

    it('asks for the referee’s own recent games and for the reports, once', async () => {
      const { games_api, reports_api, settle } = render({ games: [game_at('g1', 2)] });
      await settle();

      expect(games_api.list_games).toHaveBeenCalledTimes(1);
      const query = games_api.list_games.mock.calls[0][0];
      expect(query).toEqual({
        scope: GamesScope.MINE,
        only_with_open_slots: false,
        include_cancelled: false,
        from: NOW - 7 * 24 * HOUR,
        to: NOW + 12 * HOUR,
      });
      expect(reports_api.list_reports).toHaveBeenCalledTimes(1);
    });

    it('sets the page title and announces how many games need a report in a polite live region', async () => {
      const { element, by_testid, settle } = render({
        games: [game_at('g1', 2), game_at('g2', 5)],
      });
      await settle();

      expect(element.querySelector('hch-page-container')?.textContent).toContain('Match reports');
      const count = by_testid('reports-count');
      expect(count?.textContent?.trim()).toBe('2 games need a report');
      expect(count?.getAttribute('role')).toBe('status');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('says "1 game needs a report" in the singular', async () => {
      const { by_testid, settle } = render({ games: [game_at('g1', 2)] });
      await settle();

      expect(by_testid('reports-count')?.textContent?.trim()).toBe('1 game needs a report');
    });
  });

  describe('the lists', () => {
    it('lists the games that need a report, most recent first', async () => {
      const { row_ids, settle } = render({
        games: [game_at('old', 30), game_at('newer', 3), game_at('mid', 10)],
      });
      await settle();

      expect(row_ids('reports-needs-report')).toEqual([
        'report-row-newer',
        'report-row-mid',
        'report-row-old',
      ]);
    });

    it('keeps a draft under "needs a report" and puts a finished report under "reported"', async () => {
      const { row_ids, by_testid, settle } = render({
        games: [game_at('plain', 2), game_at('draft', 4), game_at('done', 6)],
        summaries: [
          make_summary({ report_id: 'r1', game_id: 'draft', status: ReportStatus.DRAFT }),
          make_summary({
            report_id: 'r2',
            game_id: 'done',
            status: ReportStatus.READY,
            home_score: 2,
            away_score: 1,
          }),
        ],
      });
      await settle();

      expect(row_ids('reports-needs-report')).toEqual(['report-row-plain', 'report-row-draft']);
      expect(row_ids('reports-reported')).toEqual(['report-row-done']);
      expect(by_testid('reports-needs-count')?.textContent?.trim()).toBe('2');
      expect(by_testid('reports-reported-count')?.textContent?.trim()).toBe('1');
      expect(by_testid('report-score-done')?.textContent?.trim()).toBe('2 – 1');
    });

    it('leaves out games that have not started and cancelled games', async () => {
      const { row_ids, settle } = render({
        games: [
          game_at('started', 1),
          game_at('upcoming', -2),
          game_at('cancelled', 3, { status: GameStatus.CANCELLED }),
        ],
      });
      await settle();

      expect(row_ids('reports-needs-report')).toEqual(['report-row-started']);
    });

    it('says everything is done when only finished reports remain', async () => {
      const { by_testid, row_ids, settle } = render({
        games: [game_at('done', 6)],
        summaries: [make_summary({ game_id: 'done', status: ReportStatus.READY })],
      });
      await settle();

      expect(by_testid('reports-caught-up')?.textContent).toContain('You are all caught up.');
      expect(row_ids('reports-needs-report')).toEqual([]);
      expect(by_testid('reports-count')?.textContent?.trim()).toBe('No games need a report');
      expect(by_testid('reports-report-latest')).toBeNull();
    });

    it('shows no "reported" section when there is nothing reported', async () => {
      const { by_testid, settle } = render({ games: [game_at('g1', 2)] });
      await settle();

      expect(by_testid('reports-reported')).toBeNull();
    });
  });

  describe('the big button', () => {
    it('opens the most recent game that needs a report, and names it', async () => {
      const { by_testid, router, settle } = render({
        games: [game_at('old', 30), game_at('newer', 3)],
      });
      await settle();
      const button = by_testid('reports-report-latest');

      expect(button?.textContent).toContain('Report this game');
      expect(button?.textContent).toContain('Home newer vs Away newer');
      expect(button?.getAttribute('aria-label')).toBe('Report this game: Home newer vs Away newer');
      button?.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports/newer');
    });

    it('skips a game that is already reported', async () => {
      const { by_testid, router, settle } = render({
        games: [game_at('done', 1), game_at('open', 5)],
        summaries: [make_summary({ game_id: 'done', status: ReportStatus.READY })],
      });
      await settle();

      by_testid('reports-report-latest')?.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports/open');
    });

    it('encodes the game id in the address', async () => {
      const { by_testid, router, settle } = render({ games: [game_at('a/b', 1)] });
      await settle();

      by_testid('reports-report-latest')?.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports/a%2Fb');
    });
  });

  describe('opening a row', () => {
    it('opens that game’s report', async () => {
      const { by_testid, router, settle } = render({
        games: [game_at('g1', 1), game_at('g2', 3)],
      });
      await settle();

      by_testid('report-open-g2')?.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports/g2');
    });
  });

  describe('empty', () => {
    it('says there are no games to report, with a way to Games', async () => {
      const { by_testid, router, element, settle } = render({ games: [] });
      await settle();

      expect(element.textContent).toContain('No games to report');
      by_testid('reports-empty-games')?.click();

      expect(router.navigateByUrl).toHaveBeenCalledWith('/games');
      expect(by_testid('reports-report-latest')).toBeNull();
    });
  });

  describe('permissions', () => {
    it('shows a clear no-access state and makes no request without games.read', async () => {
      const { by_testid, games_api, reports_api, settle } = render({
        permissions: WRITE_ONLY_PERMISSIONS,
      });
      await settle();

      expect(by_testid('reports-no-access')).not.toBeNull();
      expect(games_api.list_games).not.toHaveBeenCalled();
      expect(reports_api.list_reports).not.toHaveBeenCalled();
    });

    it('lets someone with only games.read see the list, but not open reports', async () => {
      const { by_testid, row_ids, settle } = render({
        permissions: READ_ONLY_PERMISSIONS,
        games: [game_at('g1', 2)],
      });
      await settle();

      expect(row_ids('reports-needs-report')).toEqual(['report-row-g1']);
      expect(by_testid('reports-report-latest')).toBeNull();
      expect(by_testid('report-open-g1')).toBeNull();
    });

    it('does not flash "no access" while the session is still loading', async () => {
      const { by_testid, session, settle } = render({ session: { is_loading: true } });
      await settle();
      expect(by_testid('reports-no-access')).toBeNull();

      session.is_loading.set(false);
      await settle();
      expect(by_testid('reports-no-access')).toBeNull();
    });
  });

  describe('errors', () => {
    it('says the list could not be loaded, and the Retry button loads it again', async () => {
      let calls = 0;
      const { by_testid, element, games_api, settle } = render({
        list_games: () =>
          ++calls === 1
            ? throwError(() => http_error(500, 'BOOM'))
            : of(result_of(game_at('g1', 1))),
      });
      await settle();

      expect(element.textContent).toContain('Match reports could not be loaded');
      expect(element.textContent).not.toContain('English');
      by_testid('reports-retry')?.click();
      await settle();

      expect(games_api.list_games).toHaveBeenCalledTimes(2);
      expect(by_testid('reports-needs-report')).not.toBeNull();
    });

    it('logs the real error', async () => {
      const error = http_error(500, 'BOOM');
      const { settle } = render({ list_games: () => throwError(() => error) });
      await settle();

      expect(logged).toHaveBeenCalledWith('Could not load the match reports', expect.anything());
    });

    it('fails when the reports cannot be read, even if the games can', async () => {
      const { element, settle } = render({
        games: [game_at('g1', 1)],
        list_reports: () => throwError(() => http_error(500, 'BOOM')),
      });
      await settle();

      expect(element.textContent).toContain('Match reports could not be loaded');
    });

    it('asks a platform administrator to choose a tenant', async () => {
      const { element, by_testid, settle } = render({
        list_games: () => throwError(() => http_error(400, 'TENANT_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
      expect(by_testid('reports-retry')).not.toBeNull();
    });

    it('offers no Retry for a refused role', async () => {
      const { element, by_testid, settle } = render({
        list_games: () => throwError(() => http_error(403, 'PERMISSION_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('You do not have access to match reports');
      expect(by_testid('reports-retry')).toBeNull();
    });

    it('reloads the session, not the list, when the session itself failed', async () => {
      const { by_testid, session, games_api, settle } = render({ session: { has_failed: true } });
      await settle();

      by_testid('reports-retry')?.click();

      expect(session.reload_count()).toBe(1);
      expect(games_api.list_games).not.toHaveBeenCalled();
    });
  });
});
