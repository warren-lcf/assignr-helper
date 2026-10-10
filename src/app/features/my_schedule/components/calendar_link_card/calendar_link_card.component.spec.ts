import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  IShareLinkManagerItem,
  ShareLinkManagerComponent,
} from '@hch-shared-libraries/ui-kit/common/share_link_manager';
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
import {
  FAKE_FEED_TOKEN,
  FRESH_FEED,
  USED_FEED,
  make_issued_feed,
} from '../../mocks/feed_view.mock';
import {
  ISessionDoubleOptions,
  MEMBER_PERMISSIONS,
  OWNER_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IFeedView } from '../../models/feed_view.model';
import { IIssuedFeed } from '../../models/issued_feed.model';
import { MyScheduleFeedApiService } from '../../services/my_schedule_feed_api.service';
import { CalendarLinkCardComponent } from './calendar_link_card.component';

interface IRenderOptions {
  permissions?: readonly PermissionKey[];
  session?: ISessionDoubleOptions;
  /** The feed the backend holds; null for none. */
  feed?: IFeedView | null;
  get_feed?: () => Observable<IFeedView | null>;
  create_feed?: () => Observable<IIssuedFeed>;
  rotate_feed?: () => Observable<IIssuedFeed>;
  revoke_feed?: () => Observable<void>;
}

function render(options: IRenderOptions = {}) {
  const backend = { feed: options.feed === undefined ? null : options.feed };
  const api = {
    get_feed: vi.fn(options.get_feed ?? (() => of(backend.feed))),
    create_feed: vi.fn(
      options.create_feed ??
        (() => {
          backend.feed = FRESH_FEED;
          return of(make_issued_feed());
        }),
    ),
    rotate_feed: vi.fn(
      options.rotate_feed ??
        (() =>
          of(
            make_issued_feed({
              token: 'rotated-token-never-real',
              path: '/api/public/cal/rotated-token-never-real.ics',
            }),
          )),
    ),
    revoke_feed: vi.fn(
      options.revoke_feed ??
        (() => {
          backend.feed = null;
          return of(undefined);
        }),
    ),
  };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  const session = make_session_service_double(
    options.permissions ?? OWNER_PERMISSIONS,
    options.session,
  );
  TestBed.configureTestingModule({
    imports: [CalendarLinkCardComponent],
    providers: [
      { provide: MyScheduleFeedApiService, useValue: api },
      { provide: SessionService, useValue: session },
      { provide: ToastService, useValue: toast },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
      { provide: USER_DATE_TIMEZONE, useValue: () => 'UTC' },
      { provide: USER_DATE_LOCALE, useValue: () => 'en-US' },
    ],
  });
  const fixture = TestBed.createComponent(CalendarLinkCardComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const manager = () =>
    fixture.debugElement.query(By.directive(ShareLinkManagerComponent))
      .componentInstance as ShareLinkManagerComponent;
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    toast,
    settle,
    by_testid,
    manager,
  };
}

function http_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'English', violations: [] } });
}

const FEED_URL = `${window.location.origin}/api/public/cal/${FAKE_FEED_TOKEN}.ics`;

describe('CalendarLinkCardComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('states', () => {
    it('shows the manager loading while the feed is read, with no controls to act on yet', () => {
      const pending = new Subject<IFeedView | null>();
      const { manager } = render({ get_feed: () => pending });

      expect(manager().is_loading()).toBe(true);
    });

    it('shows the manager loading while the session loads, and reads no feed yet', async () => {
      const { manager, api, settle } = render({ session: { is_loading: true } });
      await settle();

      expect(manager().is_loading()).toBe(true);
      expect(api.get_feed).not.toHaveBeenCalled();
    });

    it('reads no feed without games.read', async () => {
      const { api, settle } = render({ permissions: [PermissionKey.REPORTS_WRITE] });
      await settle();

      expect(api.get_feed).not.toHaveBeenCalled();
    });

    it('offers to create a link when there is none, to someone who may manage', async () => {
      const { by_testid, manager, settle } = render();
      await settle();

      expect(manager().links()).toEqual([]);
      expect(by_testid('share-link-manager-create')).not.toBeNull();
      expect(by_testid('calendar-link-status')).toBeNull();
    });

    it('lists the feed as one active row named for the calendar link, with its status below', async () => {
      const { by_testid, manager, element, settle } = render({ feed: USED_FEED });
      await settle();

      const [item] = manager().links() as IShareLinkManagerItem[];
      expect(item.link_id).toBe('my-schedule-feed');
      expect(item.scope_label).toBe('My schedule calendar link');
      expect(item.view_count).toBe(1234);
      expect(item.last_viewed_at).toBe(USED_FEED.last_fetched_at);
      expect(element.querySelectorAll('[data-testid^="share-link-manager-row-"]')).toHaveLength(1);
      expect(by_testid('calendar-link-last-fetched')?.textContent?.trim()).toBe('Oct 9, 3:42 PM');
      expect(by_testid('calendar-link-fetch-count')?.textContent?.trim()).toBe('1,234');
    });

    it('says "Not fetched yet" for a feed no calendar app has read', async () => {
      const { by_testid, settle } = render({ feed: FRESH_FEED });
      await settle();

      expect(by_testid('calendar-link-last-fetched')?.textContent?.trim()).toBe('Not fetched yet');
      expect(by_testid('calendar-link-fetch-count')?.textContent?.trim()).toBe('0');
    });

    it('shows a failure to read the feed beside the card, with a retry, and no manager', async () => {
      let calls = 0;
      const { by_testid, element, api, settle } = render({
        get_feed: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of(FRESH_FEED),
      });
      await settle();

      const alert = by_testid('calendar-link-load-error');
      expect(alert?.getAttribute('role')).toBe('alert');
      expect(alert?.textContent).toContain('The calendar link could not be loaded.');
      expect(element.querySelector('hch-share-link-manager')).toBeNull();
      expect(logged).toHaveBeenCalledWith('Could not load the calendar link', expect.anything());

      by_testid('calendar-link-retry')?.click();
      await settle();

      expect(api.get_feed).toHaveBeenCalledTimes(2);
      expect(by_testid('calendar-link-load-error')).toBeNull();
      expect(element.querySelector('hch-share-link-manager')).not.toBeNull();
    });
  });

  describe('a member without calendar_feed.manage', () => {
    it('sees the link’s status but no create, rotate or revoke controls', async () => {
      const { by_testid, element, manager, settle } = render({
        permissions: MEMBER_PERMISSIONS,
        feed: USED_FEED,
      });
      await settle();

      expect(manager().can_manage()).toBe(false);
      expect(by_testid('share-link-manager-create')).toBeNull();
      expect(
        element.querySelectorAll('[data-testid*="-rotate-"], [data-testid*="-revoke-"]'),
      ).toHaveLength(0);
      expect(element.querySelectorAll('[data-testid^="share-link-manager-row-"]')).toHaveLength(1);
      expect(by_testid('calendar-link-fetch-count')?.textContent?.trim()).toBe('1,234');
    });

    it('is told why, and sees no instructions for a link they cannot have', async () => {
      const { by_testid, settle } = render({ permissions: MEMBER_PERMISSIONS, feed: USED_FEED });
      await settle();

      expect(by_testid('calendar-link-readonly')?.textContent).toContain(
        'Your role cannot create, replace or revoke the calendar link',
      );
      expect(by_testid('calendar-link-how-to')).toBeNull();
    });

    it('does not show the explanation to an owner', async () => {
      const { by_testid, settle } = render({ feed: USED_FEED });
      await settle();

      expect(by_testid('calendar-link-readonly')).toBeNull();
    });
  });

  describe('instructions', () => {
    it('explain Google, Apple and Outlook, and that calendar apps refresh on their own schedule', async () => {
      const { by_testid, settle } = render();
      await settle();

      const how_to = by_testid('calendar-link-how-to')?.textContent ?? '';
      expect(how_to).toContain('Google Calendar');
      expect(how_to).toContain('From URL');
      expect(how_to).toContain('Apple Calendar');
      expect(how_to).toContain('New Calendar Subscription');
      expect(how_to).toContain('Outlook');
      expect(how_to).toContain('Subscribe from web');
      expect(how_to).toContain('on their own schedule');
      expect(how_to).toContain('syncs from Assignr every 4 hours');
    });
  });

  describe('creating the link', () => {
    it('shows the absolute address once, with Copy and an Open in my calendar app button', async () => {
      const { by_testid, api, settle } = render();
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(api.create_feed).toHaveBeenCalledTimes(1);
      expect(by_testid('share-link-manager-url')?.textContent?.trim()).toBe(FEED_URL);
      expect(by_testid('share-link-manager-copy')).not.toBeNull();
      const open = by_testid('calendar-link-open-button');
      expect(open?.getAttribute('href')).toBe(FEED_URL.replace(/^https?:\/\//, 'webcal://'));
      expect(open?.textContent).toContain('Open in my calendar app');
    });

    it('reads the feed again afterwards, so its status shows', async () => {
      const { by_testid, api, settle } = render();
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(api.get_feed).toHaveBeenCalledTimes(2);
      expect(by_testid('calendar-link-last-fetched')?.textContent?.trim()).toBe('Not fetched yet');
    });

    it('announces the new link to screen readers without saying the address', async () => {
      const { by_testid, settle } = render();
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      const announcement = by_testid('calendar-link-announcement');
      expect(announcement?.getAttribute('aria-live')).toBe('polite');
      expect(announcement?.textContent).toContain('Calendar link created');
      expect(announcement?.textContent).not.toContain(FAKE_FEED_TOKEN);
    });

    it('takes the address, the webcal button and every trace of the token off the page on Done', async () => {
      const { by_testid, element, component, settle } = render();
      await settle();
      by_testid('share-link-manager-create')?.click();
      await settle();
      expect(element.textContent).toContain(FAKE_FEED_TOKEN);

      by_testid('share-link-manager-done')?.click();
      await settle();

      expect(by_testid('share-link-manager-reveal')).toBeNull();
      expect(by_testid('calendar-link-open')).toBeNull();
      expect(element.innerHTML).not.toContain(FAKE_FEED_TOKEN);
      expect(component.revealed_link()).toBeNull();
      expect(component.webcal_href()).toBeNull();
    });

    it('never puts the token in storage, a toast or the console', async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const { by_testid, toast, settle } = render();
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();
      by_testid('share-link-manager-done')?.click();
      await settle();

      const everywhere = JSON.stringify([
        { ...localStorage },
        { ...sessionStorage },
        toast.show_success.mock.calls,
        toast.show_error.mock.calls,
        toast.show_info.mock.calls,
        log.mock.calls,
        warn.mock.calls,
        logged.mock.calls,
      ]);
      expect(everywhere).not.toContain(FAKE_FEED_TOKEN);
      expect(window.location.href).not.toContain(FAKE_FEED_TOKEN);
      log.mockRestore();
      warn.mockRestore();
    });

    it('does not ask the server again when a link already exists, and says to rotate it', async () => {
      const { by_testid, api, settle } = render({ feed: FRESH_FEED });
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(api.create_feed).not.toHaveBeenCalled();
      expect(by_testid('calendar-link-action-error')?.getAttribute('role')).toBe('alert');
      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'rotate the existing one',
      );
    });

    it('explains a rejected create (the link was made elsewhere meanwhile) and shows the link that exists', async () => {
      let feed: IFeedView | null = null;
      const { by_testid, api, settle } = render({
        get_feed: () => of(feed),
        create_feed: () => {
          feed = FRESH_FEED;
          return throwError(() => http_error(409, 'FEED_EXISTS'));
        },
      });
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'You already have a calendar link',
      );
      expect(api.get_feed).toHaveBeenCalledTimes(2);
      expect(by_testid('calendar-link-fetch-count')).not.toBeNull();
      expect(by_testid('share-link-manager-reveal')).toBeNull();
    });

    it('says the link could not be created on a general failure, and logs the real error', async () => {
      const failure = http_error(500, 'INTERNAL');
      const { by_testid, settle } = render({ create_feed: () => throwError(() => failure) });
      await settle();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'The calendar link could not be created. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Could not update the calendar link', failure);
      expect(by_testid('share-link-manager-reveal')).toBeNull();
    });

    it('clears an earlier failure when the next try starts', async () => {
      let calls = 0;
      const { by_testid, settle } = render({
        create_feed: () =>
          ++calls === 1 ? throwError(() => http_error(500, 'INTERNAL')) : of(make_issued_feed()),
      });
      await settle();
      by_testid('share-link-manager-create')?.click();
      await settle();
      expect(by_testid('calendar-link-action-error')).not.toBeNull();

      by_testid('share-link-manager-create')?.click();
      await settle();

      expect(by_testid('calendar-link-action-error')).toBeNull();
      expect(by_testid('share-link-manager-reveal')).not.toBeNull();
    });

    it('ignores a second create while one is in flight', async () => {
      const pending = new Subject<IIssuedFeed>();
      const { component, api, settle } = render({ create_feed: () => pending });
      await settle();

      const first = component.on_create_requested();
      const second = component.on_create_requested();
      expect(api.create_feed).toHaveBeenCalledTimes(1);
      expect(component.is_working()).toBe(true);
      pending.next(make_issued_feed());
      pending.complete();
      await Promise.all([first, second]);

      expect(component.is_working()).toBe(false);
    });
  });

  describe('rotating the link', () => {
    it('asks the server, then shows the new address once and replaces the old one', async () => {
      const { by_testid, manager, api, settle } = render({ feed: USED_FEED });
      await settle();

      manager().rotate_requested.emit(manager().links()[0]);
      await settle();

      expect(api.rotate_feed).toHaveBeenCalledTimes(1);
      expect(by_testid('share-link-manager-url')?.textContent?.trim()).toBe(
        `${window.location.origin}/api/public/cal/rotated-token-never-real.ics`,
      );
      expect(by_testid('calendar-link-announcement')?.textContent).toContain(
        'Calendar link replaced',
      );
      expect(api.get_feed).toHaveBeenCalledTimes(2);
    });

    it('says there is nothing to rotate when the link is gone, and reads the feed again', async () => {
      const { by_testid, manager, api, settle } = render({
        feed: USED_FEED,
        rotate_feed: () => throwError(() => http_error(404, 'NOT_FOUND')),
      });
      await settle();

      manager().rotate_requested.emit(manager().links()[0]);
      await settle();

      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'There is no calendar link to change',
      );
      expect(api.get_feed).toHaveBeenCalledTimes(2);
      expect(by_testid('share-link-manager-reveal')).toBeNull();
    });

    it('says the link could not be replaced on a general failure, keeping the old status', async () => {
      const { by_testid, manager, settle } = render({
        feed: USED_FEED,
        rotate_feed: () => throwError(() => http_error(500, 'INTERNAL')),
      });
      await settle();

      manager().rotate_requested.emit(manager().links()[0]);
      await settle();

      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'The calendar link could not be replaced. Try again.',
      );
      expect(by_testid('calendar-link-fetch-count')?.textContent?.trim()).toBe('1,234');
    });
  });

  describe('revoking the link', () => {
    it('asks the server, closes any open address, and goes back to offering a new link', async () => {
      const { by_testid, manager, api, toast, component, settle } = render({ feed: USED_FEED });
      await settle();
      component.revealed_link.set({ link_id: 'my-schedule-feed', url: FEED_URL });
      await settle();
      expect(by_testid('share-link-manager-reveal')).not.toBeNull();

      manager().revoke_requested.emit(manager().links()[0]);
      await settle();

      expect(api.revoke_feed).toHaveBeenCalledTimes(1);
      expect(toast.show_success).toHaveBeenCalledWith('Calendar link revoked.');
      expect(by_testid('share-link-manager-reveal')).toBeNull();
      expect(by_testid('calendar-link-open')).toBeNull();
      expect(manager().links()).toEqual([]);
      expect(by_testid('calendar-link-status')).toBeNull();
    });

    it('says it could not be revoked, logs the real error and keeps the link', async () => {
      const failure = http_error(500, 'INTERNAL');
      const { by_testid, manager, toast, settle } = render({
        feed: USED_FEED,
        revoke_feed: () => throwError(() => failure),
      });
      await settle();

      manager().revoke_requested.emit(manager().links()[0]);
      await settle();

      expect(by_testid('calendar-link-action-error')?.textContent).toContain(
        'The calendar link could not be revoked. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Could not revoke the calendar link', failure);
      expect(toast.show_success).not.toHaveBeenCalled();
      expect(manager().links()).toHaveLength(1);
    });

    it('ignores a second revoke while one is in flight', async () => {
      const pending = new Subject<void>();
      const { component, api, settle } = render({ feed: USED_FEED, revoke_feed: () => pending });
      await settle();

      const first = component.on_revoke_requested();
      const second = component.on_revoke_requested();
      expect(api.revoke_feed).toHaveBeenCalledTimes(1);
      pending.next();
      pending.complete();
      await Promise.all([first, second]);
    });
  });
});
