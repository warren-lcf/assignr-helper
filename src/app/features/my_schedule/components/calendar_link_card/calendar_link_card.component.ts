import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  IShareLinkManagerItem,
  IShareLinkManagerRevealedLink,
  ShareLinkManagerComponent,
} from '@hch-shared-libraries/ui-kit/common/share_link_manager';
import { ToastService, UserDateFormat, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { Observable, firstValueFrom } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { FEED_LINK_ID } from '../../constants/my_schedule.constant';
import { FeedErrorKind } from '../../enums/feed_error_kind.enum';
import { IFeedActivityText } from '../../models/feed_activity_text.model';
import { IIssuedFeed } from '../../models/issued_feed.model';
import { IMappedFeedError } from '../../models/mapped_feed_error.model';
import { MyScheduleFeedApiService } from '../../services/my_schedule_feed_api.service';
import { build_feed_link_item } from '../../utils/build_feed_link_item';
import { build_feed_url } from '../../utils/build_feed_url';
import { build_webcal_url } from '../../utils/build_webcal_url';
import { describe_feed_activity } from '../../utils/describe_feed_activity';
import { map_feed_api_error } from '../../utils/map_feed_api_error';

/**
 * The calendar link of My Schedule: a private address the referee adds to Google, Apple or Outlook
 * Calendar so their games appear there and stay current. It is the ui-kit's share link manager
 * (create, rotate, revoke, and the one-time panel that shows the address once with Copy), fed by the
 * backend's single feed per referee, with how it is used and short instructions for adding it.
 *
 * The address contains a secret that the backend hands out only when it creates or rotates the feed.
 * It lives only in `revealed_link`, which drives the panel: it is never written to storage, the URL,
 * a toast or the console, and it is gone once the panel is dismissed. The `webcal://` button that
 * opens the calendar app exists only while the panel does, for the same reason.
 *
 * Creating, rotating and revoking need `calendar_feed.manage`; without it the card shows the
 * link's status only. A failure here is shown beside the card and never blocks the agenda.
 */
@Component({
  selector: 'app-calendar-link-card',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    CardHeaderComponent,
    ShareLinkManagerComponent,
  ],
  providers: [UserDatePipe],
  templateUrl: './calendar_link_card.component.html',
  styleUrl: './calendar_link_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarLinkCardComponent {
  private readonly api = inject(MyScheduleFeedApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly document = inject(DOCUMENT);
  private readonly user_date = inject(UserDatePipe);

  /** True while `/api/me` has not answered yet, so nothing is asked of the feed before permissions are known. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_read = computed(() =>
    this.session.permissions().has(PermissionKey.GAMES_READ),
  );
  public readonly can_manage = computed(() =>
    this.session.permissions().has(PermissionKey.CALENDAR_FEED_MANAGE),
  );

  /** The referee's feed (null when there is none); not requested until permissions allow reading. */
  public readonly feed = rxResource({
    params: () => (!this.is_session_pending() && this.can_read() ? true : undefined),
    stream: () => this.api.get_feed(),
  });
  public readonly current_feed = computed(() => (this.feed.hasValue() ? this.feed.value() : null));
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_read() && !this.feed.hasValue() && this.feed.error() === undefined),
  );
  /** The failure to read the feed's status; the manager is not drawn then, since its list would be a guess. */
  public readonly load_error = computed<IMappedFeedError | null>(() => {
    const error = this.feed.error();
    return error === undefined || this.feed.hasValue()
      ? null
      : map_feed_api_error(
          error,
          (key) => this.t(key),
          this.t('The calendar link could not be loaded.'),
        );
  });
  /** The rows for the manager: the one feed, or none. */
  public readonly links = computed<IShareLinkManagerItem[]>(() => {
    const feed = this.current_feed();
    return feed === null ? [] : [build_feed_link_item(feed, this.t('My schedule calendar link'))];
  });
  /** When a calendar app last read the feed and how often; null with no feed. */
  public readonly activity = computed<IFeedActivityText | null>(() => {
    const feed = this.current_feed();
    return feed === null
      ? null
      : describe_feed_activity(
          feed,
          (utc_ms) => this.user_date.transform(utc_ms, UserDateFormat.SHORT_OMIT_CURRENT_YEAR),
          (key) => this.t(key),
        );
  });

  /** The new link, while its one-time panel is open; the only place the address is ever held. */
  public readonly revealed_link = signal<IShareLinkManagerRevealedLink | null>(null);
  /** True while a create, rotate or revoke request is in flight. */
  public readonly is_working = signal(false);
  /** Why the last create, rotate or revoke failed; cleared when the next one starts. */
  public readonly action_error = signal<IMappedFeedError | null>(null);
  /** What the screen-reader-only status line says about the last change. */
  public readonly announcement = signal('');
  /**
   * The `webcal://` form of the revealed address, for the "Open in my calendar app" button; null
   * whenever the panel is closed, so the address cannot be rebuilt from the page later.
   * Angular only trusts web addresses in `href`, so this one is marked safe: it is the app's own
   * origin and path with the scheme swapped.
   */
  public readonly webcal_href = computed<SafeUrl | null>(() => {
    const revealed = this.revealed_link();
    const webcal_url = revealed === null ? null : build_webcal_url(revealed.url);
    return webcal_url === null ? null : this.sanitizer.bypassSecurityTrustUrl(webcal_url);
  });

  public constructor() {
    effect(() => {
      const error = this.feed.error();
      if (error) console.error('Could not load the calendar link', error);
    });
  }

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }

  /**
   * Reads the feed again, after a failed load.
   * @returns Nothing.
   */
  public retry(): void {
    this.feed.reload();
  }

  /**
   * Creates the feed and opens the one-time panel with its address. If a feed already exists, it
   * says so instead of asking the server.
   * @returns Resolves when the request has finished.
   */
  public async on_create_requested(): Promise<void> {
    if (this.current_feed() !== null) {
      // The manager always offers Create link; there is only ever one feed, so say so without asking the server.
      this.action_error.set({
        kind: FeedErrorKind.ALREADY_EXISTS,
        message: this.t(
          'You already have a calendar link. To get a new address, rotate the existing one.',
        ),
      });
      return;
    }
    await this.issue(
      () => this.api.create_feed(),
      this.t('The calendar link could not be created. Try again.'),
      this.t('Calendar link created. Copy it now; it will not be shown again.'),
    );
  }

  /**
   * Replaces the feed's address (the manager has already asked for confirmation) and opens the
   * one-time panel with the new one.
   * @returns Resolves when the request has finished.
   */
  public async on_rotate_requested(): Promise<void> {
    await this.issue(
      () => this.api.rotate_feed(),
      this.t('The calendar link could not be replaced. Try again.'),
      this.t('Calendar link replaced. Copy the new one now; it will not be shown again.'),
    );
  }

  /**
   * Revokes the feed (the manager has already asked for confirmation).
   * @returns Resolves when the request has finished.
   */
  public async on_revoke_requested(): Promise<void> {
    if (this.is_working()) return;
    this.is_working.set(true);
    this.action_error.set(null);
    try {
      await firstValueFrom(this.api.revoke_feed());
      this.revealed_link.set(null);
      this.announcement.set(this.t('Calendar link revoked.'));
      this.toast.show_success(this.t('Calendar link revoked.'));
    } catch (error) {
      console.error('Could not revoke the calendar link', error);
      this.fail(error, this.t('The calendar link could not be revoked. Try again.'));
    } finally {
      this.is_working.set(false);
      this.feed.reload();
    }
  }

  /**
   * Closes the one-time panel; the address cannot be shown again.
   * @returns Nothing.
   */
  public on_reveal_dismissed(): void {
    this.revealed_link.set(null);
  }

  /**
   * Runs a create or rotate call, whose answer carries the secret, and hands the address to the
   * panel. Nothing from the answer is logged or kept anywhere else.
   * @param call Makes the request.
   * @param failure_message Said when the request fails for no special reason.
   * @param success_message Said to screen readers when it works.
   * @returns Resolves when the request has finished.
   */
  private async issue(
    call: () => Observable<IIssuedFeed>,
    failure_message: string,
    success_message: string,
  ): Promise<void> {
    if (this.is_working()) return;
    this.is_working.set(true);
    this.action_error.set(null);
    try {
      const issued = await firstValueFrom(call());
      this.revealed_link.set({
        link_id: FEED_LINK_ID,
        url: build_feed_url(this.document.location.origin, issued.path),
        scope_label: this.t('My schedule calendar link'),
      });
      this.announcement.set(success_message);
    } catch (error) {
      console.error('Could not update the calendar link', error);
      this.fail(error, failure_message);
    } finally {
      this.is_working.set(false);
      this.feed.reload();
    }
  }

  private fail(error: unknown, fallback_message: string): void {
    const mapped = map_feed_api_error(error, (key) => this.t(key), fallback_message);
    this.action_error.set(mapped);
    this.announcement.set(mapped.message);
  }
}
