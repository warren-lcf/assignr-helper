import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { Observable, Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GamesScope } from '../../enums/games_scope.enum';
import {
  agenda_header_buttons,
  read_agenda_groups,
  read_agenda_labels,
} from '../../mocks/agenda_list_dom.mock';
import {
  EMPTY_GAMES_RESULT,
  GAMES_RESULT,
  RIVERSIDE_LOCATION,
  SATURDAY_DATE,
  make_date_group,
  make_game_view,
  make_games_result,
} from '../../mocks/game_view.mock';
import {
  ISessionDoubleOptions,
  NO_GAMES_PERMISSIONS,
  REFEREE_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGamesQuery } from '../../models/games_query.model';
import { IGamesResult } from '../../models/games_result.model';
import { GamesApiService } from '../../services/games_api.service';
import { LAST_SCOPE_STORAGE_KEY } from '../../utils/last_scope_storage';
import { GamesPageComponent } from './games_page.component';

interface IRenderOptions {
  permissions?: readonly (typeof REFEREE_PERMISSIONS)[number][];
  session?: ISessionDoubleOptions;
  list_games?: (query: IGamesQuery) => Observable<IGamesResult>;
  /** The IANA zone the viewer is in; the browser's own when left out. */
  viewer_zone?: string;
}

function render(options: IRenderOptions = {}) {
  const api = {
    list_games: vi.fn((query: IGamesQuery) =>
      options.list_games ? options.list_games(query) : of(GAMES_RESULT),
    ),
  };
  const session = make_session_service_double(
    options.permissions ?? REFEREE_PERMISSIONS,
    options.session,
  );
  const router = { navigateByUrl: vi.fn(() => Promise.resolve(true)) };
  TestBed.configureTestingModule({
    imports: [GamesPageComponent],
    providers: [
      { provide: GamesApiService, useValue: api },
      { provide: SessionService, useValue: session },
      { provide: Router, useValue: router },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
      ...(options.viewer_zone
        ? [{ provide: USER_DATE_TIMEZONE, useValue: () => options.viewer_zone as string }]
        : []),
    ],
  });
  const fixture = TestBed.createComponent(GamesPageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const queries = () => api.list_games.mock.calls.map(([query]) => query);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    session,
    router,
    settle,
    by_testid,
    queries,
  };
}

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

describe('GamesPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
    localStorage.clear();
  });

  describe('loading and showing games', () => {
    it('shows skeletons while the first list loads', () => {
      const pending = new Subject<IGamesResult>();
      const { by_testid, element } = render({ list_games: () => pending });

      expect(by_testid('games-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-line').length).toBeGreaterThan(0);
      expect(element.querySelector('hch-grouped-agenda-list')).toBeNull();
    });

    it('shows skeletons while the session loads, and asks for no games yet', async () => {
      const { by_testid, api, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(by_testid('games-loading')).not.toBeNull();
      expect(api.list_games).not.toHaveBeenCalled();
    });

    it('lists a group per location, in the order the backend gave, under the page title', async () => {
      const { element, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.textContent).toContain('Games');
      expect(element.querySelectorAll('hch-grouped-agenda-list')).toHaveLength(1);
      expect(read_agenda_labels(element, 0)).toEqual([
        'Riverside Park',
        'Location to be announced',
      ]);
    });

    it('asks for open games with default filters', async () => {
      const { queries, settle } = render();
      await settle();

      expect(queries()).toEqual([
        { scope: 'OPEN', only_with_open_slots: false, include_cancelled: false },
      ]);
    });

    it('announces the count in a polite live region', async () => {
      const { by_testid, settle } = render();
      await settle();
      const count = by_testid('games-count');

      expect(count?.textContent?.trim()).toBe('4 games');
      expect(count?.getAttribute('role')).toBe('status');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('names a single game in the singular', async () => {
      const { by_testid, settle } = render({
        list_games: () =>
          of(
            make_games_result({
              locations: [{ ...RIVERSIDE_LOCATION, dates: [RIVERSIDE_LOCATION.dates[1]] }],
              total: 1,
            }),
          ),
      });
      await settle();

      expect(by_testid('games-count')?.textContent?.trim()).toBe('1 game');
    });
  });

  describe('grouping by venue', () => {
    it('groups by venue by default, with the switch on', async () => {
      const { element, by_testid, settle } = render();
      await settle();

      expect(read_agenda_labels(element, 0)).toEqual([
        'Riverside Park',
        'Location to be announced',
      ]);
      expect(read_agenda_labels(element, 1)).toEqual([
        'Saturday, Oct 10',
        'Sunday, Oct 11',
        'Date to be announced',
      ]);
      expect(by_testid('games-toggle-group-by-venue')?.textContent).toContain('Group by venue');
      expect(
        by_testid('games-toggle-group-by-venue')
          ?.querySelector('button[role="switch"]')
          ?.getAttribute('aria-checked'),
      ).toBe('true');
    });

    it('turning the switch off lists the games by date and time, without asking again', async () => {
      const { element, component, api, fixture, settle } = render();
      await settle();

      component.on_group_by_venue_changed(false);
      fixture.detectChanges();
      await settle();

      expect(read_agenda_labels(element, 0)).toEqual([
        'Saturday, Oct 10',
        'Sunday, Oct 11',
        'Date to be announced',
      ]);
      expect(read_agenda_labels(element, 1)).toEqual([]);
      const rows = Array.from(element.querySelectorAll('[data-testid^="game-row-"]')).map((row) =>
        row.getAttribute('data-testid'),
      );
      expect(rows).toEqual([
        'game-row-game-1',
        'game-row-game-2',
        'game-row-game-3',
        'game-row-game-4',
      ]);
      expect(api.list_games).toHaveBeenCalledTimes(1);
    });

    it('turning it back on restores the venue groups', async () => {
      const { element, component, fixture, settle } = render();
      await settle();

      component.on_group_by_venue_changed(false);
      fixture.detectChanges();
      component.on_group_by_venue_changed(true);
      fixture.detectChanges();
      await settle();

      expect(read_agenda_labels(element, 0)).toEqual([
        'Riverside Park',
        'Location to be announced',
      ]);
      expect(read_agenda_labels(element, 1)).toHaveLength(3);
    });

    it('remembers the choice for the next visit', async () => {
      const first = render();
      await first.settle();
      first.component.on_group_by_venue_changed(false);
      first.fixture.detectChanges();
      await first.settle();
      TestBed.resetTestingModule();

      const second = render();
      await second.settle();

      expect(read_agenda_labels(second.element, 0)).toEqual([
        'Saturday, Oct 10',
        'Sunday, Oct 11',
        'Date to be announced',
      ]);
      expect(read_agenda_labels(second.element, 1)).toEqual([]);
    });
  });

  describe('the agenda list', () => {
    it('is one list for all games, with a location level over a date level over the rows', async () => {
      const { element, settle } = render();
      await settle();

      expect(element.querySelectorAll('hch-grouped-agenda-list')).toHaveLength(1);
      expect(read_agenda_groups(element).map((group) => [group.level, group.label])).toEqual([
        [0, 'Riverside Park'],
        [1, 'Saturday, Oct 10'],
        [1, 'Sunday, Oct 11'],
        [0, 'Location to be announced'],
        [1, 'Date to be announced'],
      ]);
      const rows = Array.from(element.querySelectorAll('[data-testid^="game-row-"]')).map((row) =>
        row.getAttribute('data-testid'),
      );
      expect(rows).toEqual([
        'game-row-game-1',
        'game-row-game-2',
        'game-row-game-3',
        'game-row-game-4',
      ]);
    });

    it('counts the games in every group, in the singular for one', async () => {
      const { element, settle } = render();
      await settle();

      expect(read_agenda_groups(element).map((group) => group.count)).toEqual([
        '3 games',
        '2 games',
        '1 game',
        '1 game',
        '1 game',
      ]);
    });

    it('names the weekday of the calendar date even for a viewer west of UTC', async () => {
      const { element, settle } = render({ viewer_zone: 'Pacific/Honolulu' });
      await settle();

      // A date stored as UTC midnight would read a day early (Friday) if it were formatted in the viewer zone.
      expect(read_agenda_labels(element, 1).slice(0, 2)).toEqual([
        'Saturday, Oct 10',
        'Sunday, Oct 11',
      ]);
    });

    it('keeps two dates a year apart as two groups when the venue grouping is off', async () => {
      const next_year = Date.UTC(2027, 9, 10);
      const { element, component, fixture, settle } = render({
        list_games: () =>
          of(
            make_games_result({
              locations: [
                {
                  location_label: 'Riverside Park',
                  dates: [
                    make_date_group(SATURDAY_DATE, [make_game_view({ game_id: 'this-year' })]),
                    make_date_group(next_year, [
                      make_game_view({
                        game_id: 'next-year',
                        local_date: next_year,
                        start_at: next_year + 14 * 3_600_000,
                      }),
                    ]),
                  ],
                },
              ],
              total: 2,
            }),
          ),
      });
      await settle();
      component.on_group_by_venue_changed(false);
      fixture.detectChanges();
      await settle();

      expect(read_agenda_groups(element).map((group) => group.key)).toEqual([
        String(SATURDAY_DATE),
        String(next_year),
      ]);
    });

    it('merges the same date from several venues into one group, by start time, without grouping by venue', async () => {
      const { element, component, fixture, settle } = render({
        list_games: () =>
          of(
            make_games_result({
              locations: [
                {
                  location_label: 'Lakeside Fields',
                  dates: [
                    make_date_group(SATURDAY_DATE, [
                      make_game_view({
                        game_id: 'early',
                        location_group: 'Lakeside Fields',
                        start_at: SATURDAY_DATE + 9 * 3_600_000,
                      }),
                    ]),
                  ],
                },
                {
                  location_label: 'Riverside Park',
                  dates: [make_date_group(SATURDAY_DATE, [make_game_view({ game_id: 'late' })])],
                },
              ],
              total: 2,
            }),
          ),
      });
      await settle();
      component.on_group_by_venue_changed(false);
      fixture.detectChanges();
      await settle();

      expect(read_agenda_groups(element)).toEqual([
        expect.objectContaining({ label: 'Saturday, Oct 10', count: '2 games', row_count: 2 }),
      ]);
      expect(
        Array.from(element.querySelectorAll('[data-testid^="game-row-"]')).map((row) =>
          row.getAttribute('data-testid'),
        ),
      ).toEqual(['game-row-early', 'game-row-late']);
    });

    it('names where each game is played only when the venue grouping is off', async () => {
      const { element, by_testid, component, fixture, settle } = render();
      await settle();
      expect(element.querySelector('[data-testid^="game-location-"]')).toBeNull();

      component.on_group_by_venue_changed(false);
      fixture.detectChanges();
      await settle();

      expect(by_testid('game-location-game-1')?.textContent).toContain('Riverside Park');
      expect(by_testid('game-location-game-4')?.textContent).toContain('Location to be announced');
    });

    it('shows kick-off in the list time column on the venue clock, whatever zone the viewer is in', async () => {
      const { element, by_testid, settle } = render({ viewer_zone: 'Pacific/Honolulu' });
      await settle();

      const time = by_testid('game-time-game-1');
      expect(time?.textContent?.trim()).toMatch(/^9:00\s?AM CDT$/);
      expect(time?.closest('.agenda_row_time')).not.toBeNull();
      // The row itself does not repeat it.
      expect(element.querySelectorAll('[data-testid="game-time-game-1"]')).toHaveLength(1);
    });

    it('falls back to the viewer clock, still naming the zone, when the venue zone is unknown', async () => {
      const { by_testid, settle } = render({ viewer_zone: 'Pacific/Honolulu' });
      await settle();

      expect(by_testid('game-time-game-4')?.textContent?.trim()).toMatch(/^4:00\s?AM HST$/);
    });

    it('draws rows as plain read-only items, not buttons', async () => {
      const { element, settle } = render();
      await settle();

      const rows = element.querySelectorAll('[data-testid="grouped-agenda-row"]');
      expect(rows).toHaveLength(4);
      for (const row of Array.from(rows)) expect(row.tagName).not.toBe('BUTTON');
      expect(element.querySelector('.agenda_row_chevron')).toBeNull();
    });

    it('collapses a group from its header and opens it again, keeping the count', async () => {
      const { element, fixture, settle } = render();
      await settle();
      const riverside = () => read_agenda_groups(element)[0];
      expect(riverside()).toEqual(expect.objectContaining({ expanded: true, count: '3 games' }));
      expect(element.querySelector('[data-testid="game-row-game-1"]')).not.toBeNull();

      agenda_header_buttons(element)[0].click();
      fixture.detectChanges();

      expect(riverside()).toEqual(expect.objectContaining({ expanded: false, count: '3 games' }));
      expect(element.querySelector('[data-testid="game-row-game-1"]')).toBeNull();
      expect(element.querySelector('[data-testid="game-row-game-3"]')).toBeNull();
      expect(element.querySelector('[data-testid="game-row-game-4"]')).not.toBeNull();

      agenda_header_buttons(element)[0].click();
      fixture.detectChanges();

      expect(riverside().expanded).toBe(true);
      expect(element.querySelector('[data-testid="game-row-game-1"]')).not.toBeNull();
    });

    it('forgets what was collapsed when the venue grouping changes', async () => {
      const { element, component, fixture, settle } = render();
      await settle();
      agenda_header_buttons(element)[0].click();
      fixture.detectChanges();
      expect(component.collapsed_key_paths()).toHaveLength(1);

      component.on_group_by_venue_changed(false);
      fixture.detectChanges();

      expect(component.collapsed_key_paths()).toEqual([]);
    });

    it('moves between group headers with the arrow keys, Home and End', async () => {
      const { element, fixture, settle } = render();
      await settle();
      const headers = agenda_header_buttons(element);
      const press = (from: HTMLElement, key: string) => {
        from.focus();
        from.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        fixture.detectChanges();
      };

      press(headers[0], 'ArrowDown');
      expect(document.activeElement).toBe(headers[1]);
      press(headers[1], 'End');
      expect(document.activeElement).toBe(headers[headers.length - 1]);
      press(headers[headers.length - 1], 'ArrowUp');
      expect(document.activeElement).toBe(headers[headers.length - 2]);
      press(headers[headers.length - 2], 'Home');
      expect(document.activeElement).toBe(headers[0]);
    });
  });

  describe('permissions', () => {
    it('shows a clear no-access state, and asks for no games, without games.read', async () => {
      const { by_testid, element, api, settle } = render({ permissions: NO_GAMES_PERMISSIONS });
      await settle();

      expect(by_testid('games-no-access')?.textContent).toContain(
        'You do not have access to games',
      );
      expect(element.querySelector('app-games-filters')).toBeNull();
      expect(api.list_games).not.toHaveBeenCalled();
    });

    it('offers a retry that reloads the session when it could not load', async () => {
      const { by_testid, session, api, element, settle } = render({
        permissions: [],
        session: { has_failed: true },
      });
      await settle();

      expect(element.textContent).toContain('Games could not be loaded');
      expect(by_testid('games-no-access')).toBeNull();
      by_testid('games-retry')?.click();

      expect(session.reload_count()).toBeGreaterThan(0);
      expect(api.list_games).not.toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    it('sends the search, scope and toggles the user chose', async () => {
      const { component, queries, settle } = render();
      await settle();

      component.filters.update((filters) => ({
        ...filters,
        scope: GamesScope.MINE,
        search: ' hawks ',
        only_with_open_slots: true,
        include_cancelled: true,
      }));
      await settle();

      expect(queries()[queries().length - 1]).toEqual({
        scope: 'MINE',
        search: 'hawks',
        only_with_open_slots: true,
        include_cancelled: true,
      });
    });

    it('does not ask again when a filter changes in a way that leaves the query the same', async () => {
      const { component, api, settle } = render();
      await settle();

      component.filters.update((filters) => ({ ...filters, search: '   ' }));
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
    });

    it('asks once with no facet chosen: the list itself fills the facet options', async () => {
      const { component, api, settle } = render();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
      expect(component.facet_options().league).toEqual(['Fall League']);
      expect(component.facet_options().location_group).toEqual([
        'Riverside Park',
        'Location to be announced',
      ]);
    });

    it('asks for facet options without the facets once one is chosen, so the other options stay', async () => {
      const spring = make_games_result({
        locations: [
          {
            location_label: 'Riverside Park',
            dates: [{ local_date: 1, games: [make_game_view({ league: 'Spring League' })] }],
          },
        ],
      });
      const { component, queries, settle } = render({
        list_games: (query) => of(query.league ? spring : GAMES_RESULT),
      });
      await settle();

      component.filters.update((filters) => ({ ...filters, league: 'Spring League' }));
      await settle();

      const sent = queries();
      expect(sent).toHaveLength(3);
      expect(sent.filter((query) => query.league === 'Spring League')).toHaveLength(1);
      expect(sent.filter((query) => query.league === undefined)).toHaveLength(2);
      expect(component.facet_options().league).toEqual(['Fall League', 'Spring League']);
      expect(component.shown_count()).toBe(1);
    });

    it('remembers the scope and starts from it next time', async () => {
      const first = render();
      await first.settle();
      first.component.filters.update((filters) => ({ ...filters, scope: GamesScope.ALL }));
      await first.settle();
      expect(localStorage.getItem(LAST_SCOPE_STORAGE_KEY)).toBe('ALL');
      TestBed.resetTestingModule();

      const second = render();
      await second.settle();

      expect(second.component.filters().scope).toBe(GamesScope.ALL);
      expect(second.queries()[0].scope).toBe('ALL');
    });

    it('keeps the previous list, dimmed and marked busy, while the next one loads', async () => {
      const next = new Subject<IGamesResult>();
      let first = true;
      const { fixture, component, element, by_testid, settle } = render({
        list_games: () => {
          if (first) {
            first = false;
            return of(GAMES_RESULT);
          }
          return next;
        },
      });
      await settle();

      component.filters.update((filters) => ({ ...filters, search: 'lions' }));
      // The second request never answers yet, so the app is not stable: let it start, then render.
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();

      const list = by_testid('games-list');
      expect(list?.getAttribute('aria-busy')).toBe('true');
      expect(list?.classList).toContain('games-page__results--busy');
      expect(by_testid('games-loading')).toBeNull();
      expect(read_agenda_labels(element, 0)).toHaveLength(2);

      next.next(EMPTY_GAMES_RESULT);
      next.complete();
      await settle();

      expect(by_testid('games-list')).toBeNull();
    });
  });

  describe('notices and empty states', () => {
    it('warns when the list was cut off, with the number shown', async () => {
      const { by_testid, settle } = render({
        list_games: () => of({ ...GAMES_RESULT, truncated: true }),
      });
      await settle();

      expect(by_testid('games-truncated')?.textContent).toContain(
        'Showing the first 4 games — narrow your filters to see the rest.',
      );
    });

    it('does not warn when the list is complete', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('games-truncated')).toBeNull();
    });

    it('says no games match when filters are on, and clearing them keeps the scope', async () => {
      const { component, by_testid, element, queries, settle } = render({
        list_games: (query) => of(query.search ? EMPTY_GAMES_RESULT : GAMES_RESULT),
      });
      await settle();
      component.filters.update((filters) => ({
        ...filters,
        scope: GamesScope.MINE,
        search: 'zebras',
      }));
      await settle();

      expect(element.textContent).toContain('No games match your filters');
      expect(by_testid('games-count')?.textContent?.trim()).toBe('0 games');

      by_testid('games-empty-clear')?.click();
      await settle();

      expect(component.filters().search).toBe('');
      expect(component.filters().scope).toBe(GamesScope.MINE);
      expect(queries()[queries().length - 1].scope).toBe('MINE');
      expect(element.querySelector('hch-grouped-agenda-list')).not.toBeNull();
    });

    it.each([
      [GamesScope.OPEN, 'There are no open games right now.'],
      [GamesScope.MINE, 'You are not assigned to any upcoming games.'],
      [GamesScope.ALL, 'Sync a connection to bring in games from your assignors.'],
    ])(
      'says there are no games yet for scope %s, and points to Connections',
      async (scope, text) => {
        localStorage.setItem(LAST_SCOPE_STORAGE_KEY, scope);
        const { element, by_testid, router, settle } = render({
          list_games: () => of(EMPTY_GAMES_RESULT),
        });
        await settle();

        expect(element.textContent).toContain('No games yet');
        expect(element.textContent).toContain(text);
        by_testid('games-empty-connections')?.click();
        expect(router.navigateByUrl).toHaveBeenCalledWith('/connections');
      },
    );
  });

  describe('errors', () => {
    it('shows an error state with a retry, logging the real error', async () => {
      const failure = http_error(500, 'INTERNAL');
      let fail = true;
      const { element, by_testid, api, settle } = render({
        list_games: () => (fail ? throwError(() => failure) : of(GAMES_RESULT)),
      });
      await settle();

      expect(element.textContent).toContain('Games could not be loaded');
      expect(element.querySelector('hch-grouped-agenda-list')).toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the games', expect.anything());

      fail = false;
      by_testid('games-retry')?.click();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
      expect(read_agenda_labels(element, 0)).toHaveLength(2);
    });

    it('asks a platform administrator to choose a tenant', async () => {
      const { element, settle } = render({
        list_games: () => throwError(() => http_error(400, 'TENANT_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });

    it('explains refused filters, and clearing them is the action', async () => {
      const { component, element, by_testid, settle } = render({
        list_games: (query) =>
          query.search ? throwError(() => http_error(400, 'VALIDATION_ERROR')) : of(GAMES_RESULT),
      });
      await settle();
      component.filters.update((filters) => ({ ...filters, search: 'x'.repeat(10) }));
      await settle();

      expect(element.textContent).toContain('Those filters cannot be used');
      expect(by_testid('games-error-clear')?.textContent).toContain('Clear filters');

      by_testid('games-error-clear')?.click();
      await settle();

      expect(component.filters().search).toBe('');
      expect(element.querySelector('hch-grouped-agenda-list')).not.toBeNull();
    });

    it('offers no action for a refused role', async () => {
      const { element, by_testid, settle } = render({
        list_games: () => throwError(() => http_error(403, 'PERMISSION_REQUIRED')),
      });
      await settle();

      expect(element.textContent).toContain('You do not have access to games');
      expect(by_testid('games-retry')).toBeNull();
      expect(by_testid('games-error-clear')).toBeNull();
    });

    it('logs a failure to load the filter options without breaking the list', async () => {
      const { component, element, settle } = render({
        list_games: (query) =>
          query.league ? of(GAMES_RESULT) : throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();
      expect(element.textContent).toContain('Games could not be loaded');

      component.filters.update((filters) => ({ ...filters, league: 'Fall League' }));
      await settle();

      expect(logged).toHaveBeenCalledWith('Could not load the filter options', expect.anything());
      expect(element.querySelector('hch-grouped-agenda-list')).not.toBeNull();
    });
  });
});
