import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { PublicLinkErrorKind } from '../../enums/public_link_error_kind.enum';
import {
  EMPTY_PUBLIC_GAMES_RESULT,
  PUBLIC_FAKE_TOKEN,
  PUBLIC_GAMES_RESULT,
  make_public_games_result,
} from '../../mocks/public_games_result.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IPublicGamesQuery } from '../../models/public_games_query.model';
import { IPublicGamesResult } from '../../models/public_games_result.model';
import { PublicQuickLinkApiService } from '../../services/public_quick_link_api.service';
import { PublicQuickLinkError } from '../../services/public_quick_link_error';
import { PublicQuickLinkPageComponent } from './public_quick_link_page.component';

type ListGames = (token: string, query: IPublicGamesQuery) => Observable<IPublicGamesResult>;

function not_active(): PublicQuickLinkError {
  return new PublicQuickLinkError(PublicLinkErrorKind.NOT_ACTIVE, 404, 'NOT_FOUND');
}
function rate_limited(retry_after_ms: number | null = null): PublicQuickLinkError {
  return new PublicQuickLinkError(
    PublicLinkErrorKind.RATE_LIMITED,
    429,
    'RATE_LIMITED',
    retry_after_ms,
  );
}
function unavailable(): PublicQuickLinkError {
  return new PublicQuickLinkError(PublicLinkErrorKind.UNAVAILABLE, 500, null);
}

/** Pretends the tab is hidden or visible, and tells the page. */
function set_visibility(state: 'hidden' | 'visible'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function render(list_games: ListGames = () => of(PUBLIC_GAMES_RESULT)) {
  const api = { list_games: vi.fn(list_games) };
  TestBed.configureTestingModule({
    imports: [PublicQuickLinkPageComponent],
    providers: [
      { provide: PublicQuickLinkApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(PublicQuickLinkPageComponent);
  fixture.componentRef.setInput('token', PUBLIC_FAKE_TOKEN);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const queries = () => api.list_games.mock.calls.map(([, query]) => query);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    settle,
    by_testid,
    queries,
  };
}

describe('PublicQuickLinkPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    logged.mockRestore();
  });

  describe('showing games', () => {
    it('shows skeletons while the first answer is on its way', () => {
      const pending = new Subject<IPublicGamesResult>();
      const { by_testid, element } = render(() => pending);

      expect(by_testid('public-loading')?.getAttribute('aria-busy')).toBe('true');
      expect(element.querySelectorAll('hch-skeleton-line').length).toBeGreaterThan(0);
      expect(element.querySelector('app-public-location-card')).toBeNull();
    });

    it('asks for the games of the link with no query to begin with', async () => {
      const { api, settle } = render();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
      expect(api.list_games).toHaveBeenCalledWith(PUBLIC_FAKE_TOKEN, {});
    });

    it('titles the page and stamps the time of the answer', async () => {
      const { element, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.textContent).toContain('Games available');
      expect(element.textContent).toMatch(/As of \d{1,2}:\d{2}/);
    });

    it('groups games by location, then date, then time, in the order the server gave', async () => {
      const { element, settle } = render();
      await settle();

      const cards = element.querySelectorAll('app-public-location-card');
      expect(cards).toHaveLength(2);
      expect(cards[0].textContent).toContain('Riverside Park');
      expect(cards[1].textContent).toContain('Location to be announced');
      expect(cards[0].querySelectorAll('section')).toHaveLength(2);
      expect(cards[0].querySelectorAll('[data-testid^="public-game-title-"]')).toHaveLength(3);
      expect(cards[1].textContent).toContain('Date to be announced');
      expect(cards[1].textContent).toContain('Teams to be announced');
    });

    it('announces the count politely', async () => {
      const { by_testid, settle } = render();
      await settle();
      const count = by_testid('public-count');

      expect(count?.textContent?.trim()).toBe('4 games');
      expect(count?.getAttribute('role')).toBe('status');
      expect(count?.getAttribute('aria-live')).toBe('polite');
    });

    it('never shows fees or organization names', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('public-list')?.textContent).not.toMatch(/\$|fee|organization/i);
    });

    it('says when games are not all listed', async () => {
      const { by_testid, settle } = render(() => of(make_public_games_result({ total: 2500 })));
      await settle();

      expect(by_testid('public-truncated')?.textContent).toContain('Showing 4 of 2,500 games.');
    });

    it('offers Refresh in the page header', async () => {
      const { by_testid, api, settle } = render();
      await settle();

      by_testid('public-refresh')?.click();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });

    it('ignores Refresh while a request is already running', async () => {
      const { by_testid, api, settle } = render();
      await settle();
      by_testid('public-refresh')?.click();
      by_testid('public-refresh')?.click();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });
  });

  describe('searching and filtering', () => {
    it('sends search and facets as query parameters, and offers the options the answer lists', async () => {
      const { component, api, settle } = render();
      await settle();

      component.filters.update((filters) => ({ ...filters, search: ' lions ' }));
      await settle();
      component.filters.update((filters) => ({ ...filters, level: 'Select' }));
      await settle();

      expect(api.list_games.mock.calls.map(([, query]) => query)).toEqual([
        {},
        { search: 'lions' },
        { search: 'lions', level: 'Select' },
      ]);
      expect(component.facet_options().level).toEqual(['Premier', 'Select']);
    });

    it('does not ask again when the query comes out the same', async () => {
      const { component, api, settle } = render();
      await settle();

      component.filters.update((filters) => ({ ...filters, search: '   ' }));
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
    });

    it('keeps the list on screen, dimmed and busy, while a newer answer loads', async () => {
      const second = new Subject<IPublicGamesResult>();
      let calls = 0;
      const { fixture, component, by_testid, element, settle } = render(() =>
        ++calls === 1 ? of(PUBLIC_GAMES_RESULT) : second,
      );
      await settle();

      component.filters.update((filters) => ({ ...filters, search: 'x' }));
      // The second request never finishes, so wait for the page to react, not for the app to be stable.
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();

      expect(element.querySelectorAll('app-public-location-card')).toHaveLength(2);
      expect(by_testid('public-list')?.getAttribute('aria-busy')).toBe('true');
    });

    it('says nothing matches, and Clear filters brings everything back', async () => {
      const { component, by_testid, element, queries, settle } = render((_, query) =>
        of(query.search ? EMPTY_PUBLIC_GAMES_RESULT : PUBLIC_GAMES_RESULT),
      );
      await settle();

      component.filters.update((filters) => ({ ...filters, search: 'zebras' }));
      await settle();
      expect(element.textContent).toContain('No games match your search');
      expect(by_testid('public-count')?.textContent?.trim()).toBe('0 games');

      by_testid('public-empty-clear')?.click();
      await settle();

      expect(queries()[queries().length - 1]).toEqual({});
      expect(element.querySelectorAll('app-public-location-card')).toHaveLength(2);
    });

    it('says there are no games right now when the link has none', async () => {
      const { by_testid, settle } = render(() => of(EMPTY_PUBLIC_GAMES_RESULT));
      await settle();

      expect(by_testid('public-empty')?.textContent).toContain('No games right now');
    });
  });

  describe('failures', () => {
    it('says only that the link is no longer active, and offers nothing else, for a 404', async () => {
      const { by_testid, element, settle } = render(() => throwError(() => not_active()));
      await settle();

      expect(by_testid('public-inactive')?.textContent).toContain('This link is no longer active');
      expect(by_testid('public-inactive')?.textContent).toContain(
        'Ask the person who sent it for a new one.',
      );
      expect(by_testid('public-refresh')).toBeNull();
      expect(by_testid('public-retry')).toBeNull();
      expect(element.querySelector('app-public-games-filters')).toBeNull();
      expect(element.textContent).not.toMatch(/expire|revoked/i);
    });

    it('shows a calm "too many requests" state with a retry for a 429', async () => {
      let calls = 0;
      const { by_testid, element, api, settle } = render(() =>
        ++calls === 1 ? throwError(() => rate_limited()) : of(PUBLIC_GAMES_RESULT),
      );
      await settle();

      expect(by_testid('public-error')?.textContent).toContain('Too many requests');
      expect(by_testid('public-error')?.textContent).toContain('Please try again in a moment.');
      by_testid('public-retry')?.click();
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
      expect(element.querySelectorAll('app-public-location-card')).toHaveLength(2);
    });

    it('shows a retry for a network failure', async () => {
      let calls = 0;
      const { by_testid, element, settle } = render(() =>
        ++calls === 1 ? throwError(() => unavailable()) : of(PUBLIC_GAMES_RESULT),
      );
      await settle();

      expect(element.textContent).toContain('Games could not be loaded');
      by_testid('public-retry')?.click();
      await settle();

      expect(element.querySelectorAll('app-public-location-card')).toHaveLength(2);
    });

    it('treats an error that is not ours as a network failure', async () => {
      const { element, settle } = render(() => throwError(() => new Error('boom')));
      await settle();

      expect(element.textContent).toContain('Games could not be loaded');
    });

    it('keeps the last list on screen, with a notice and a retry, when a refresh fails', async () => {
      let calls = 0;
      const { component, by_testid, element, settle } = render(() =>
        ++calls === 1 ? of(PUBLIC_GAMES_RESULT) : throwError(() => unavailable()),
      );
      await settle();

      component.refresh();
      await settle();

      expect(element.querySelectorAll('app-public-location-card')).toHaveLength(2);
      expect(by_testid('public-stale-notice')?.textContent).toContain('Showing the last update.');
      expect(by_testid('public-stale-retry')).not.toBeNull();
    });

    it('switches to "no longer active" when the link dies while the page is open', async () => {
      let calls = 0;
      const { component, by_testid, element, settle } = render(() =>
        ++calls === 1 ? of(PUBLIC_GAMES_RESULT) : throwError(() => not_active()),
      );
      await settle();

      component.refresh();
      await settle();

      expect(by_testid('public-inactive')).not.toBeNull();
      expect(element.querySelector('app-public-location-card')).toBeNull();
    });

    it('logs only the kind, status and code, never the token', async () => {
      render(() => throwError(() => not_active()));
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise((resolve) => setTimeout(resolve));

      expect(logged).toHaveBeenCalledWith('Could not load the quick link games', {
        kind: PublicLinkErrorKind.NOT_ACTIVE,
        status: 404,
        code: 'NOT_FOUND',
      });
      expect(JSON.stringify(logged.mock.calls)).not.toContain(PUBLIC_FAKE_TOKEN);
    });
  });

  describe('automatic refresh', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    });

    it('refreshes once a minute while the tab is visible, and not more often', async () => {
      const { api, settle } = render();
      await settle();

      vi.advanceTimersByTime(59_000);
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(2);

      vi.advanceTimersByTime(60_000);
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(3);
    });

    it('pauses while the tab is hidden and does not queue refreshes up', async () => {
      const { api, settle } = render();
      await settle();

      set_visibility('hidden');
      vi.advanceTimersByTime(300_000);
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
    });

    it('refreshes at once on return when the answer is a minute old or more', async () => {
      const { api, settle } = render();
      await settle();
      set_visibility('hidden');
      vi.advanceTimersByTime(120_000);

      set_visibility('visible');
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });

    it('does not refresh on return when the answer is recent, but the minute timer restarts', async () => {
      const { api, settle } = render();
      await settle();
      set_visibility('hidden');
      vi.advanceTimersByTime(10_000);
      set_visibility('visible');
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_000);
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });

    it('stops refreshing once the link is no longer active', async () => {
      const { api, settle } = render(() => throwError(() => not_active()));
      await settle();

      vi.advanceTimersByTime(300_000);
      await settle();
      set_visibility('hidden');
      set_visibility('visible');
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(1);
    });

    it('stays quiet for the length of a Retry-After, then carries on', async () => {
      let calls = 0;
      const { api, settle } = render(() =>
        ++calls === 1 ? throwError(() => rate_limited(150_000)) : of(PUBLIC_GAMES_RESULT),
      );
      await settle();

      vi.advanceTimersByTime(60_000);
      await settle();
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(60_000);
      await settle();
      expect(api.list_games).toHaveBeenCalledTimes(2);
    });

    it('caps a very long Retry-After at five minutes', async () => {
      let calls = 0;
      const { api, settle } = render(() =>
        ++calls === 1 ? throwError(() => rate_limited(3_600_000)) : of(PUBLIC_GAMES_RESULT),
      );
      await settle();

      vi.advanceTimersByTime(300_000);
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });
  });

  describe('lifecycle', () => {
    it('adds a robots noindex tag while open and removes it on destroy', async () => {
      const { fixture, settle } = render();
      await settle();

      expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
        'noindex, nofollow',
      );
      fixture.destroy();

      expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    });

    it('removes the very same visibility handler it added, and clears its timer, on destroy', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      const add = vi.spyOn(document, 'addEventListener');
      const remove = vi.spyOn(document, 'removeEventListener');
      const { fixture, api, settle } = render();
      await settle();
      const added = add.mock.calls.find(([name]) => name === 'visibilitychange');

      fixture.destroy();

      expect(added).toBeDefined();
      expect(remove).toHaveBeenCalledWith('visibilitychange', added?.[1]);
      vi.advanceTimersByTime(300_000);
      expect(api.list_games).toHaveBeenCalledTimes(1);
      add.mockRestore();
      remove.mockRestore();
    });

    it('does not start a timer when the tab opens hidden, and starts one when it becomes visible', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      const { api, settle } = render();
      await settle();
      vi.advanceTimersByTime(120_000);
      expect(api.list_games).toHaveBeenCalledTimes(1);

      set_visibility('visible');
      await settle();

      expect(api.list_games).toHaveBeenCalledTimes(2);
    });
  });
});
