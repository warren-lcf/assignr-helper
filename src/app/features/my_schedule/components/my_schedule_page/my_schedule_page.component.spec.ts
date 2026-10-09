import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import {
  ToastService,
  USER_DATE_LOCALE,
  USER_DATE_TIMEZONE,
} from '@hch-shared-libraries/ui-kit/core';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { Observable, Subject, of, throwError } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GamesScope } from '../../../games/enums/games_scope.enum';
import { read_agenda_labels } from '../../../games/mocks/agenda_list_dom.mock';
import { NO_GAMES_PERMISSIONS } from '../../../games/mocks/session_service.mock';
import { IGamesQuery } from '../../../games/models/games_query.model';
import { IGamesResult } from '../../../games/models/games_result.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { FRESH_FEED } from '../../mocks/feed_view.mock';
import {
  EMPTY_SCHEDULE_RESULT,
  SATURDAY_AFTERNOON_GAME,
  SATURDAY_MORNING_GAME,
  SCHEDULE_RESULT,
  make_my_game,
  make_schedule_result,
} from '../../mocks/my_games.mock';
import {
  ISessionDoubleOptions,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IFeedView } from '../../models/feed_view.model';
import { MyScheduleFeedApiService } from '../../services/my_schedule_feed_api.service';
import { MySchedulePageComponent } from './my_schedule_page.component';

const HOUR = 3_600_000;
/** Three hours before the first game (14:00 UTC on Saturday 10 October 2026). */
const NOW = SATURDAY_MORNING_GAME.start_at - 3 * HOUR;

interface IRenderOptions {
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  list_games?: (query: IGamesQuery) => Observable<IGamesResult>;
  get_feed?: () => Observable<IFeedView | null>;
}

function render(options: IRenderOptions = {}) {
  const games_api = {
    list_games: vi.fn((query: IGamesQuery) =>
      options.list_games ? options.list_games(query) : of(SCHEDULE_RESULT),
    ),
  };
  const feed_api = {
    get_feed: vi.fn(options.get_feed ?? (() => of(FRESH_FEED))),
    create_feed: vi.fn(),
    rotate_feed: vi.fn(),
    revoke_feed: vi.fn(),
  };
  const session = make_session_service_double(
    options.permissions ?? OWNER_PERMISSIONS,
    options.session,
  );
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  TestBed.configureTestingModule({
    imports: [MySchedulePageComponent],
    providers: [
      { provide: GamesApiService, useValue: games_api },
      { provide: MyScheduleFeedApiService, useValue: feed_api },
      { provide: SessionService, useValue: session },
      { provide: Router, useValue: router },
      { provide: ToastService, useValue: toast },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
      { provide: USER_DATE_TIMEZONE, useValue: () => 'UTC' },
      { provide: USER_DATE_LOCALE, useValue: () => 'en-US' },
    ],
  });
  const fixture = TestBed.createComponent(MySchedulePageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    games_api,
    feed_api,
    session,
    router,
    settle,
    by_testid,
  };
}

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

describe('MySchedulePageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(NOW);
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
    vi.useRealTimers();
  });

  describe('loading and showing the schedule', () => {
    it('shows skeletons while the first list loads', () => {
      const pending = new Subject<IGamesResult>();
      const { by_testid, element } = render({ list_games: () => pending });

      expect(by_testid('my-schedule-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-line').length).toBeGreaterThan(0);
      expect(element.querySelector('app-schedule-agenda')).toBeNull();
    });

    it('shows skeletons while the session loads, and asks for nothing yet', async () => {
      const { by_testid, games_api, feed_api, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(by_testid('my-schedule-loading')).not.toBeNull();
      expect(games_api.list_games).not.toHaveBeenCalled();
      expect(feed_api.get_feed).not.toHaveBeenCalled();
    });

    it('asks for the referee’s own games from three hours ago to 120 days ahead, cancelled left out', async () => {
      const { games_api, settle } = render();
      await settle();

      expect(games_api.list_games).toHaveBeenCalledTimes(1);
      expect(games_api.list_games).toHaveBeenCalledWith({
        scope: GamesScope.MINE,
        only_with_open_slots: false,
        include_cancelled: false,
        from: NOW - 3 * HOUR,
        to: NOW + 120 * 24 * HOUR,
      });
    });

    it('shows the page title, the next game, the agenda by date and the calendar link', async () => {
      const { element, by_testid, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.textContent).toContain('My Schedule');
      expect(by_testid('next-up-card')).not.toBeNull();
      expect(by_testid('my-schedule-agenda')).not.toBeNull();
      expect(by_testid('calendar-link')).not.toBeNull();
      expect(read_agenda_labels(element, 0)).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
    });

    it('counts the games in a polite live region', async () => {
      const { by_testid, settle } = render();
      await settle();

      const count = by_testid('my-schedule-count');
      expect(count?.textContent?.trim()).toBe('3 games');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('names a single game in the singular', async () => {
      const { by_testid, settle } = render({
        list_games: () => of(make_schedule_result([SATURDAY_MORNING_GAME])),
      });
      await settle();

      expect(by_testid('my-schedule-count')?.textContent?.trim()).toBe('1 game');
    });

    it('orders the agenda by date and then start time, whatever order the server groups in', async () => {
      const { element, settle } = render({
        // Lakeside sorts before Riverside, so the server lists the 4 PM game before the 9 AM one.
        list_games: () => of(SCHEDULE_RESULT),
      });
      await settle();

      const titles = Array.from(element.querySelectorAll('[data-testid^="game-title-"]')).map(
        (title) => title.textContent?.trim(),
      );
      expect(titles).toEqual(['Lions vs Tigers', 'Hawks vs Owls', 'Rams vs Bulls']);
    });

    it('puts the soonest game under Next up', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('next-up-title')?.textContent?.trim()).toBe('Lions vs Tigers');
      expect(by_testid('next-up-note')?.textContent).toContain('Starts in 3 hours');
    });

    it('skips a game that is over when choosing the next one', async () => {
      const over = make_my_game({
        game_id: 'over',
        home_team: 'Past',
        away_team: 'Team',
        start_at: NOW - 3 * HOUR,
        end_at: NOW - 2 * HOUR,
      });
      const { by_testid, settle } = render({
        list_games: () => of(make_schedule_result([over, SATURDAY_AFTERNOON_GAME])),
      });
      await settle();

      expect(by_testid('next-up-title')?.textContent?.trim()).toBe('Hawks vs Owls');
      // The agenda still lists every game it was given.
      expect(by_testid('game-row-over')).not.toBeNull();
    });

    it('says nothing is coming up when every listed game is over', async () => {
      const over = make_my_game({
        game_id: 'over',
        start_at: NOW - 3 * HOUR,
        end_at: NOW - 2 * HOUR,
      });
      const { by_testid, settle } = render({
        list_games: () => of(make_schedule_result([over])),
      });
      await settle();

      expect(by_testid('next-up-empty')).not.toBeNull();
      expect(by_testid('game-row-over')).not.toBeNull();
    });

    it('moves Next up on as the clock passes, without a reload', async () => {
      const { by_testid, games_api, settle } = render();
      await settle();
      expect(by_testid('next-up-title')?.textContent?.trim()).toBe('Lions vs Tigers');

      // The 9 AM game ends at 10:15 AM Chicago; a minute later it is no longer next.
      vi.setSystemTime(SATURDAY_MORNING_GAME.end_at! + 60_000);
      vi.advanceTimersByTime(60_000);
      await settle();

      expect(by_testid('next-up-title')?.textContent?.trim()).toBe('Hawks vs Owls');
      expect(games_api.list_games).toHaveBeenCalledTimes(1);
    });

    it('stops the clock when the page is destroyed', async () => {
      const start = vi.spyOn(globalThis, 'setInterval');
      const stop = vi.spyOn(globalThis, 'clearInterval');
      const { fixture, settle } = render();
      await settle();
      const tick = start.mock.calls.findIndex(([, delay]) => delay === 60_000);
      expect(tick).toBeGreaterThanOrEqual(0);
      const timer = start.mock.results[tick].value;
      expect(stop).not.toHaveBeenCalledWith(timer);

      fixture.destroy();

      expect(stop).toHaveBeenCalledWith(timer);
      start.mockRestore();
      stop.mockRestore();
    });

    it('lists a game that has just started with a started note', async () => {
      vi.setSystemTime(SATURDAY_MORNING_GAME.start_at + 20 * 60_000);
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('next-up-note')?.textContent).toContain('Started 20 minutes ago');
    });
  });

  describe('when there is nothing to show', () => {
    it('invites finding games when none are assigned, and the invitation goes to Games', async () => {
      const { by_testid, element, router, settle } = render({
        list_games: () => of(EMPTY_SCHEDULE_RESULT),
      });
      await settle();

      expect(element.textContent).toContain('No upcoming games');
      expect(by_testid('next-up-card')).toBeNull();
      by_testid('my-schedule-empty-games')?.click();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/games');
    });

    it('still offers the calendar link when no games are assigned', async () => {
      const { by_testid, settle } = render({ list_games: () => of(EMPTY_SCHEDULE_RESULT) });
      await settle();

      expect(by_testid('calendar-link')).not.toBeNull();
    });

    it('shows a no-access state, and asks for nothing, without games.read', async () => {
      const { by_testid, games_api, feed_api, element, settle } = render({
        permissions: NO_GAMES_PERMISSIONS,
      });
      await settle();

      expect(by_testid('my-schedule-no-access')?.textContent).toContain(
        'You do not have access to your schedule',
      );
      expect(games_api.list_games).not.toHaveBeenCalled();
      expect(feed_api.get_feed).not.toHaveBeenCalled();
      expect(element.querySelector('app-calendar-link-card')).toBeNull();
    });
  });

  describe('failures', () => {
    it('shows an error with a retry when the games fail, and loads again on retry', async () => {
      let calls = 0;
      const { games_api, by_testid, element, settle } = render({
        list_games: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of(SCHEDULE_RESULT),
      });
      await settle();

      expect(element.textContent).toContain('Your schedule could not be loaded');
      expect(logged).toHaveBeenCalledWith('Could not load the schedule', expect.anything());
      by_testid('my-schedule-retry')?.click();
      await settle();

      expect(games_api.list_games).toHaveBeenCalledTimes(2);
      expect(by_testid('my-schedule-agenda')).not.toBeNull();
    });

    it('keeps the calendar link usable when the games fail', async () => {
      const { by_testid, settle } = render({
        list_games: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();

      expect(by_testid('calendar-link')).not.toBeNull();
      expect(by_testid('calendar-link-load-error')).toBeNull();
    });

    it('keeps the agenda when the calendar link fails to load', async () => {
      const { by_testid, element, settle } = render({
        get_feed: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();

      expect(by_testid('calendar-link-load-error')).not.toBeNull();
      expect(by_testid('my-schedule-agenda')).not.toBeNull();
      expect(read_agenda_labels(element, 0)).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
    });

    it('tells a platform administrator to choose a tenant first', async () => {
      const { element, settle } = render({
        list_games: () => throwError(() => http_error(400, 'TENANT_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });

    it('offers no retry to a role the server refuses', async () => {
      const { by_testid, element, settle } = render({
        list_games: () => throwError(() => http_error(403, 'PERMISSION_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('You do not have access to games');
      expect(by_testid('my-schedule-retry')).toBeNull();
    });

    it('reloads the session, not the games, when the session is what failed', async () => {
      const { by_testid, session, games_api, settle } = render({
        permissions: [],
        session: { has_failed: true },
      });
      await settle();

      by_testid('my-schedule-retry')?.click();

      expect(session.reload_count()).toBe(1);
      expect(games_api.list_games).not.toHaveBeenCalled();
    });
  });

  describe('a member', () => {
    it('sees the schedule and the link status without any link controls', async () => {
      const { by_testid, settle } = render({ permissions: MEMBER_PERMISSIONS });
      await settle();

      expect(by_testid('my-schedule-agenda')).not.toBeNull();
      expect(by_testid('calendar-link-readonly')).not.toBeNull();
      expect(by_testid('share-link-manager-create')).toBeNull();
    });
  });
});
