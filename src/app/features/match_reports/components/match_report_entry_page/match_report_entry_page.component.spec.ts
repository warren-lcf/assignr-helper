import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ToastService } from '@hch-shared-libraries/ui-kit/core';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { make_game_view } from '../../../games/mocks/game_view.mock';
import { IGamesQuery } from '../../../games/models/games_query.model';
import { IGamesResult } from '../../../games/models/games_result.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { IncidentType } from '../../enums/incident_type.enum';
import { ReportStatus } from '../../enums/report_status.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { FakeReportsServer, make_api_error } from '../../mocks/fake_reports_server.mock';
import { make_incident, make_report } from '../../mocks/match_report.mock';
import {
  ISessionDoubleOptions,
  READ_ONLY_PERMISSIONS,
  REFEREE_PERMISSIONS,
  WRITE_ONLY_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IMatchReportView } from '../../models/match_report_view.model';
import { MatchReportsApiService } from '../../services/match_reports_api.service';
import { MatchReportEntryPageComponent } from './match_report_entry_page.component';

const NOW = Date.UTC(2026, 9, 10, 18, 0, 0);
const MINUTE = 60_000;
const GAME = make_game_view({
  game_id: 'game-1',
  home_team: 'Lions',
  away_team: 'Tigers',
  venue_name: 'Field 3',
  start_at: NOW - 34 * MINUTE,
});

function result_of(...games: (typeof GAME)[]): IGamesResult {
  return {
    locations: games.length
      ? [{ location_label: 'Riverside Park', dates: [{ local_date: NOW, games }] }]
      : [],
    total: games.length,
    truncated: false,
  };
}

interface IRenderOptions {
  report?: IMatchReportView;
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  /** What the game lookup answers; the usual game when left out. */
  list_games?: (query: IGamesQuery) => Observable<IGamesResult>;
  /** What the Undo toast resolves to. */
  undo?: boolean;
  /** Errors the fake server fails its first calls with. */
  failures?: unknown[];
}

function render(options: IRenderOptions = {}) {
  const server = new FakeReportsServer(options.report ?? make_report());
  server.failures = options.failures ?? [];
  const games_api = {
    list_games: vi.fn((query: IGamesQuery) =>
      options.list_games ? options.list_games(query) : of(result_of(GAME)),
    ),
  };
  const toast = {
    show_action: vi.fn(() => Promise.resolve(options.undo ?? false)),
    show_error: vi.fn(),
    show_success: vi.fn(),
    show_info: vi.fn(),
  };
  const session = make_session_service_double(
    options.permissions ?? REFEREE_PERMISSIONS,
    options.session,
  );
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    imports: [MatchReportEntryPageComponent],
    providers: [
      { provide: MatchReportsApiService, useValue: server },
      { provide: GamesApiService, useValue: games_api },
      { provide: SessionService, useValue: session },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
    ],
  });
  const fixture = TestBed.createComponent(MatchReportEntryPageComponent);
  fixture.componentRef.setInput('game_id', 'game-1');
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (id: string) => by_testid(id)?.textContent?.trim();
  const named = (label: string) =>
    element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  const click = async (target: HTMLElement | null) => {
    target?.click();
    await settle();
  };
  const click_id = (id: string) => click(by_testid(id));
  const choose_card = async (team: TeamSide, card: IncidentType) => {
    await click_id(`choice-tile-${team}`);
    await click_id(`choice-tile-${card}`);
  };
  const save_label = () => text('match-report-save-label');
  const score = (side: 'home' | 'away') =>
    element
      .querySelector(`[data-testid="score-${side}"] [data-testid="score-stepper-value"]`)
      ?.textContent?.trim();
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    server,
    games_api,
    toast,
    session,
    router,
    settle,
    by_testid,
    text,
    named,
    click,
    click_id,
    choose_card,
    save_label,
    score,
  };
}

describe('MatchReportEntryPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  describe('opening the report', () => {
    it('shows skeletons while the report opens', () => {
      const pending = new Subject<IGamesResult>();
      const { by_testid, element } = render({ list_games: () => pending });

      expect(by_testid('match-report-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-line').length).toBeGreaterThan(0);
      expect(by_testid('match-report-entry')).toBeNull();
    });

    it('starts the game’s report once and looks the game up in the recent window', async () => {
      const { server, games_api, settle } = render();
      await settle();

      expect(server.calls).toEqual([{ name: 'open_report', args: ['game-1'] }]);
      expect(games_api.list_games).toHaveBeenCalledTimes(1);
      expect(games_api.list_games.mock.calls[0][0]).toMatchObject({
        scope: 'MINE',
        include_cancelled: false,
        from: NOW - 7 * 24 * 60 * MINUTE,
        to: NOW + 12 * 60 * MINUTE,
      });
    });

    it('shows the teams, the kick-off on the venue clock, the venue and the save state', async () => {
      const { text, by_testid, settle } = render();
      await settle();

      expect(text('match-report-home-name')).toBe('Lions');
      expect(text('match-report-away-name')).toBe('Tigers');
      expect(text('match-report-kickoff')).toMatch(/12:26\s?PM CDT/);
      expect(by_testid('match-report-header')?.textContent).toContain('Field 3');
      expect(text('match-report-save-label')).toBe('Saved');
    });

    it('puts the game in the page title area', async () => {
      const { element, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')?.textContent).toContain('Lions vs Tigers');
    });

    it('still opens the report when the game is not among the recent ones', async () => {
      const { text, by_testid, settle } = render({ list_games: () => of(result_of()) });
      await settle();

      expect(text('match-report-home-name')).toBe('Home team');
      expect(text('match-report-away-name')).toBe('Away team');
      expect(by_testid('match-report-kickoff')).toBeNull();
      expect(by_testid('match-report-entry')).not.toBeNull();
    });

    it('still opens the report when the game lookup fails, and logs why', async () => {
      const { by_testid, settle } = render({
        list_games: () => throwError(() => new HttpErrorResponse({ status: 500 })),
      });
      await settle();

      expect(by_testid('match-report-entry')).not.toBeNull();
      expect(logged).toHaveBeenCalledWith(
        'Could not look up the game for the match report',
        expect.anything(),
      );
    });

    it('shows the scores the report already has', async () => {
      const { score, settle } = render({ report: make_report({ home_score: 3, away_score: 2 }) });
      await settle();

      expect(score('home')).toBe('3');
      expect(score('away')).toBe('2');
    });

    it('goes back to the list from the back button', async () => {
      const { click_id, router, settle } = render();
      await settle();

      await click_id('match-report-back');

      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports');
    });
  });

  describe('permissions', () => {
    it.each([
      ['games.read', WRITE_ONLY_PERMISSIONS],
      ['reports.write', READ_ONLY_PERMISSIONS],
    ])('shows a no-access state and makes no request without %s', async (_name, permissions) => {
      const { by_testid, server, games_api, settle } = render({ permissions });
      await settle();

      expect(by_testid('match-report-no-access')).not.toBeNull();
      expect(server.calls).toEqual([]);
      expect(games_api.list_games).not.toHaveBeenCalled();
    });

    it('asks for nothing while the session loads, and does not flash "no access"', async () => {
      const { by_testid, server, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(by_testid('match-report-loading')).not.toBeNull();
      expect(by_testid('match-report-no-access')).toBeNull();
      expect(server.calls).toEqual([]);
    });

    it('reloads the session when the session itself failed', async () => {
      const { click_id, session, server, settle } = render({ session: { has_failed: true } });
      await settle();

      await click_id('match-report-retry');

      expect(session.reload_count()).toBe(1);
      expect(server.calls).toEqual([]);
    });
  });

  describe('when the report cannot be opened', () => {
    it('says a cancelled game has no report and offers the way back, not a retry', async () => {
      const { element, by_testid, click_id, router, settle } = render({
        failures: [make_api_error(409, 'GAME_CANCELLED')],
      });
      await settle();

      expect(element.textContent).toContain('This game was cancelled');
      expect(by_testid('match-report-retry')).toBeNull();
      await click_id('match-report-back');
      expect(router.navigateByUrl).toHaveBeenCalledWith('/match-reports');
    });

    it('says a game that is not the referee’s cannot be reported', async () => {
      const { element, settle } = render({ failures: [make_api_error(404, 'NOT_FOUND')] });
      await settle();

      expect(element.textContent).toContain('This game is not one of yours');
    });

    it('never shows the server’s own wording', async () => {
      const { element, settle } = render({ failures: [make_api_error(409, 'GAME_CANCELLED')] });
      await settle();

      expect(element.textContent).not.toContain('English');
    });

    it('offers Retry for a failure that can pass, and shows the report once it does', async () => {
      const { by_testid, click_id, server, settle } = render({
        failures: [new HttpErrorResponse({ status: 500 })],
      });
      await settle();

      expect(by_testid('match-report-entry')).toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not open the match report', expect.anything());
      await click_id('match-report-retry');

      expect(by_testid('match-report-entry')).not.toBeNull();
      expect(server.names().filter((name) => name === 'open_report')).toHaveLength(2);
    });

    it('asks a platform administrator to choose a tenant', async () => {
      const { element, settle } = render({ failures: [make_api_error(400, 'TENANT_REQUIRED')] });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });
  });

  describe('the score', () => {
    it('applies a goal at once and sends the new score', async () => {
      const { named, click, score, server, save_label, settle } = render();
      await settle();

      await click(named('Add a goal for Lions'));

      expect(score('home')).toBe('1');
      expect(score('away')).toBe('0');
      expect(server.calls.at(-1)).toEqual({
        name: 'set_scores',
        args: ['report-1', { home_score: 1, away_score: 0, client_revision: 1 }],
      });
      expect(save_label()).toBe('Saved');
    });

    it('sends a rising revision with each tap', async () => {
      const { named, click, server, settle } = render();
      await settle();

      await click(named('Add a goal for Lions'));
      await click(named('Add a goal for Tigers'));
      await click(named('Remove a goal for Lions'));

      const sent = server.calls
        .filter((call) => call.name === 'set_scores')
        .map((call) => call.args[1]);
      expect(sent).toEqual([
        { home_score: 1, away_score: 0, client_revision: 1 },
        { home_score: 1, away_score: 1, client_revision: 2 },
        { home_score: 0, away_score: 1, client_revision: 3 },
      ]);
    });

    it('says Saving… while the tap is on its way, then Saved', async () => {
      const { named, fixture, server, save_label, score, settle } = render();
      await settle();
      const release = server.hold_next();

      named('Add a goal for Lions')?.click();
      fixture.detectChanges();
      expect(save_label()).toBe('Saving…');
      expect(score('home')).toBe('1');
      release();
      await settle();

      expect(save_label()).toBe('Saved');
    });

    it('confirms a goalless result with one tap', async () => {
      const { click_id, server, score, settle } = render();
      await settle();

      await click_id('score-confirm-goalless');

      expect(score('home')).toBe('0');
      expect(server.calls.at(-1)?.args[1]).toMatchObject({ home_score: 0, away_score: 0 });
    });
  });

  describe('offline', () => {
    it('keeps the edit, says how many changes are waiting, and sends it when the signal returns', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      const { named, click, server, save_label, score, settle } = render();
      await settle();

      online.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
      await click(named('Add a goal for Lions'));

      expect(save_label()).toBe('Offline — 1 change waiting');
      expect(score('home')).toBe('1');
      expect(server.names()).toEqual(['open_report']);

      online.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      await settle();

      expect(server.names()).toEqual(['open_report', 'set_scores']);
      expect(save_label()).toBe('Saved');
    });

    it('keeps Mark ready disabled while a change waits', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      const { named, click, click_id, by_testid, text, settle } = render();
      await settle();
      online.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
      await click(named('Add a goal for Lions'));

      await click_id('finish-open');

      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(true);
      expect(text('finish-waiting')).toContain('1 change is still saving');
      online.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
      await settle();
      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(false);
    });

    it('sends edits made before a reload once the report is opened again', async () => {
      const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      const first = render();
      await first.settle();
      online.mockReturnValue(false);
      window.dispatchEvent(new Event('offline'));
      await first.click(first.named('Add a goal for Lions'));
      expect(localStorage.length).toBe(1);

      TestBed.resetTestingModule();
      online.mockReturnValue(true);
      const second = render();
      await second.settle();

      expect(second.server.names()).toEqual(['open_report', 'set_scores']);
      expect(second.server.report).toMatchObject({ home_score: 1, away_score: 0 });
      expect(localStorage.length).toBe(0);
    });

    it('stops listening to the browser when the screen goes', async () => {
      const add = vi.spyOn(window, 'addEventListener');
      const remove = vi.spyOn(window, 'removeEventListener');
      const { fixture, settle } = render();
      await settle();
      const added = add.mock.calls.find(([type]) => type === 'online')?.[1];

      fixture.destroy();

      expect(added).toBeDefined();
      expect(remove).toHaveBeenCalledWith('online', added);
    });
  });

  describe('cards', () => {
    it('adds a card, shows it in the list, and offers Undo for six seconds', async () => {
      const { choose_card, click_id, server, toast, by_testid, text, settle } = render();
      await settle();

      await choose_card(TeamSide.HOME, IncidentType.YELLOW);
      await click_id('card-add');

      expect(server.calls.at(-1)).toMatchObject({
        name: 'add_incident',
        args: [
          'report-1',
          {
            team_side: TeamSide.HOME,
            incident_type: IncidentType.YELLOW,
            jersey_number: null,
            minute: 34,
            reason_code: null,
          },
        ],
      });
      expect(text('recorded-card-type')).toBe('Yellow card');
      expect(text('recorded-card-team')).toBe('Lions');
      expect(toast.show_action).toHaveBeenCalledWith('Yellow card added for Lions.', 'Undo', {
        duration_ms: 6000,
      });
      expect(by_testid('choice-tile-HOME')?.getAttribute('aria-checked')).toBe('false');
    });

    it('sends the number, minute and reason that were chosen', async () => {
      const { choose_card, click_id, server, settle } = render();
      await settle();

      await choose_card(TeamSide.AWAY, IncidentType.RED);
      await click_id('big-numpad-key-1');
      await click_id('big-numpad-key-0');
      await click_id('minute-quick-60');
      await click_id('card-reason-VIOLENT_CONDUCT');
      await click_id('card-add');

      expect(server.calls.at(-1)?.args[1]).toMatchObject({
        team_side: TeamSide.AWAY,
        incident_type: IncidentType.RED,
        jersey_number: 10,
        minute: 60,
        reason_code: 'VIOLENT_CONDUCT',
      });
    });

    it('names the away team in the toast for an away card', async () => {
      const { choose_card, click_id, toast, settle } = render();
      await settle();

      await choose_card(TeamSide.AWAY, IncidentType.SECOND_YELLOW);
      await click_id('card-add');

      expect(toast.show_action).toHaveBeenCalledWith(
        'Second yellow added for Tigers.',
        'Undo',
        expect.anything(),
      );
    });

    it('takes the card back when Undo is pressed', async () => {
      const { choose_card, click_id, server, by_testid, settle } = render({ undo: true });
      await settle();

      await choose_card(TeamSide.HOME, IncidentType.YELLOW);
      await click_id('card-add');
      await settle();

      expect(server.names()).toEqual(['open_report', 'add_incident', 'remove_incident']);
      expect(server.report.incidents).toEqual([]);
      expect(by_testid('recorded-card')).toBeNull();
    });

    it('leaves the card in place when Undo is not pressed', async () => {
      const { choose_card, click_id, server, settle } = render({ undo: false });
      await settle();

      await choose_card(TeamSide.HOME, IncidentType.YELLOW);
      await click_id('card-add');
      await settle();

      expect(server.names()).toEqual(['open_report', 'add_incident']);
      expect(server.report.incidents).toHaveLength(1);
    });

    it('removes a card with one tap, with an Undo toast and no confirmation dialog', async () => {
      const incident = make_incident({ incident_id: 'srv-9' });
      const { click_id, server, toast, by_testid, settle } = render({
        report: make_report({ incidents: [incident] }),
      });
      await settle();

      await click_id('recorded-card-remove');

      expect(server.calls.at(-1)).toEqual({ name: 'remove_incident', args: ['report-1', 'srv-9'] });
      expect(by_testid('recorded-card')).toBeNull();
      expect(toast.show_action).toHaveBeenCalledWith('Card removed.', 'Undo', {
        duration_ms: 6000,
      });
      expect(document.querySelector('mat-dialog-container')).toBeNull();
    });

    it('puts a removed card back as a new card under a new idempotency key when Undo is pressed', async () => {
      const incident = make_incident({ incident_id: 'srv-9' });
      const { click_id, server, by_testid, settle } = render({
        report: make_report({ incidents: [incident] }),
        undo: true,
      });
      await settle();

      await click_id('recorded-card-remove');
      await settle();

      expect(server.names()).toEqual(['open_report', 'remove_incident', 'add_incident']);
      const sent = server.calls.at(-1)?.args[1] as { idempotency_key: string };
      expect(sent.idempotency_key).toMatch(/^[0-9a-f]{32}$/);
      expect(sent.idempotency_key).not.toBe(incident.idempotency_key);
      expect(sent).toEqual({
        idempotency_key: sent.idempotency_key,
        team_side: incident.team_side,
        incident_type: incident.incident_type,
        jersey_number: 7,
        minute: 34,
        reason_code: null,
        notes: null,
      });
      expect(by_testid('recorded-card')).not.toBeNull();
    });
  });

  describe('finishing', () => {
    it('lists the blockers in words when the server says the report is not ready, then marks it ready', async () => {
      const { click, click_id, named, by_testid, element, toast, settle } = render();
      await settle();

      await click_id('finish-open');
      await click_id('finish-mark-ready');

      const blockers = Array.from(
        element.querySelectorAll('[data-testid="finish-blocker"]'),
        (item) => item.textContent?.trim(),
      );
      expect(blockers).toEqual([
        'Enter the final score for Lions.',
        'Enter the final score for Tigers.',
      ]);
      expect(toast.show_error).not.toHaveBeenCalled();
      expect(by_testid('finish-ready-banner')).toBeNull();

      await click(named('Add a goal for Lions'));
      expect(by_testid('finish-blockers')).toBeNull();
      await click_id('finish-mark-ready');

      expect(by_testid('finish-ready-banner')?.textContent).toContain('Ready');
      expect(by_testid('finish-ready-banner')?.textContent).toContain(
        'Reports stay in this app for now.',
      );
    });

    it('turns everything read-only once ready, and brings the card panel back on reopen', async () => {
      const { click, click_id, named, by_testid, server, settle } = render({
        report: make_report({ home_score: 1, away_score: 0 }),
      });
      await settle();
      expect(by_testid('match-report-card-panel')).not.toBeNull();

      await click_id('finish-open');
      await click_id('finish-mark-ready');

      expect(by_testid('match-report-card-panel')).toBeNull();
      expect(named('Add a goal for Lions')?.disabled).toBe(true);
      expect(by_testid('score-confirm-goalless')).toBeNull();

      await click(by_testid('finish-reopen'));

      expect(server.report.status).toBe(ReportStatus.DRAFT);
      expect(by_testid('match-report-card-panel')).not.toBeNull();
      expect(by_testid('finish-ready-banner')).toBeNull();
      expect(named('Add a goal for Lions')?.disabled).toBe(false);
    });

    it('tells the referee when marking ready fails for another reason, and logs it', async () => {
      const { click_id, server, toast, by_testid, settle } = render({
        report: make_report({ home_score: 1, away_score: 0 }),
      });
      await settle();
      await click_id('finish-open');
      server.failures = [new HttpErrorResponse({ status: 500 })];

      await click_id('finish-mark-ready');

      expect(toast.show_error).toHaveBeenCalledWith(
        'The report could not be marked ready. Try again.',
      );
      expect(logged).toHaveBeenCalledWith(
        'Could not mark the match report ready',
        expect.anything(),
      );
      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(false);
    });

    it('tells the referee when reopening fails, and logs it', async () => {
      const { click_id, server, toast, by_testid, settle } = render({
        report: make_report({ status: ReportStatus.READY, home_score: 1, away_score: 0 }),
      });
      await settle();
      server.failures = [new HttpErrorResponse({ status: 500 })];

      await click_id('finish-reopen');

      expect(toast.show_error).toHaveBeenCalledWith('The report could not be reopened. Try again.');
      expect(logged).toHaveBeenCalledWith('Could not reopen the match report', expect.anything());
      expect(by_testid('finish-ready-banner')).not.toBeNull();
    });

    it('keeps Mark ready disabled while a change is still on its way, then enables it', async () => {
      const { named, fixture, click_id, by_testid, server, settle } = render();
      await settle();
      await click_id('finish-open');
      const release = server.hold_next();

      named('Add a goal for Lions')?.click();
      fixture.detectChanges();
      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(true);
      release();
      await settle();

      expect((by_testid('finish-mark-ready') as HTMLButtonElement).disabled).toBe(false);
    });

    it('does not start a second mark ready while one is in flight', async () => {
      const { component, server, settle } = render({
        report: make_report({ home_score: 1, away_score: 0 }),
      });
      await settle();
      const release = server.hold_next();

      const first = component.on_mark_ready();
      await component.on_mark_ready();
      release();
      await first;

      expect(server.names().filter((name) => name === 'mark_ready')).toHaveLength(1);
    });
  });

  describe('an edit the server refuses', () => {
    it('tells the referee, and shows the server’s locked report', async () => {
      const { named, click, server, toast, by_testid, settle } = render();
      await settle();
      // Another device finished the report in the meantime.
      server.report = {
        ...server.report,
        status: ReportStatus.READY,
        home_score: 4,
        away_score: 4,
      };

      await click(named('Add a goal for Lions'));

      expect(toast.show_error).toHaveBeenCalledWith(
        'This report is locked, so a change was not saved. Reopen it to edit.',
      );
      expect(by_testid('finish-ready-banner')).not.toBeNull();
      expect(logged).toHaveBeenCalled();
    });
  });
});
