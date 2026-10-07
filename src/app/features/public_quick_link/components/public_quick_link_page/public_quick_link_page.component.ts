import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Meta } from '@angular/platform-browser';
import { CardHeaderAction, PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  EmptyStateComponent,
  SkeletonLineComponent,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { format_games_label } from '../../../games/utils/format_games_label';
import {
  AUTO_REFRESH_INTERVAL_MS,
  DEFAULT_RATE_LIMIT_PAUSE_MS,
  MAX_RATE_LIMIT_PAUSE_MS,
  PUBLIC_SKELETON_CARD_COUNT,
} from '../../constants/public_quick_link.constant';
import { DEFAULT_PUBLIC_FILTERS } from '../../constants/default_public_filters.constant';
import { PublicLinkErrorKind } from '../../enums/public_link_error_kind.enum';
import { IPublicGamesFilters } from '../../models/public_games_filters.model';
import { IPublicGamesQuery } from '../../models/public_games_query.model';
import { IPublicGamesResult } from '../../models/public_games_result.model';
import { PublicQuickLinkApiService } from '../../services/public_quick_link_api.service';
import { PublicQuickLinkError } from '../../services/public_quick_link_error';
import { has_active_public_filters } from '../../utils/active_public_filter_chips';
import { are_public_queries_equal } from '../../utils/are_public_queries_equal';
import { build_public_games_query } from '../../utils/build_public_games_query';
import { count_public_games } from '../../utils/count_public_games';
import { derive_public_facet_options } from '../../utils/derive_public_facet_options';
import { map_public_link_error } from '../../utils/map_public_link_error';
import { unwrap_public_quick_link_error } from '../../utils/unwrap_public_quick_link_error';
import { PublicGamesFiltersComponent } from '../public_games_filters/public_games_filters.component';
import { PublicLocationCardComponent } from '../public_location_card/public_location_card.component';

/** Name of the robots meta tag the page adds while it is open. */
const ROBOTS_META_NAME = 'robots';
const ROBOTS_META_SELECTOR = `name='${ROBOTS_META_NAME}'`;

/**
 * The public page behind a quick link: a live, read-only list of open games
 * for anyone holding the link, with no sign-in and no app chrome. Games are
 * grouped by location, then date, then time. Search and the level, league and
 * location filters run on the server.
 *
 * The page refreshes itself every minute while the tab is visible and pauses
 * while it is hidden (and for the length of a "too many requests" pause). It
 * says only that a link "is no longer active": it never reveals whether the
 * link expired, was revoked or never existed. The token comes from the route
 * and is used only in the request address; it is never logged, stored or shown,
 * and failures are reduced to a kind, status and code before they get here.
 */
@Component({
  selector: 'app-public-quick-link-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    PublicGamesFiltersComponent,
    PublicLocationCardComponent,
  ],
  templateUrl: './public_quick_link_page.component.html',
  styleUrl: './public_quick_link_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicQuickLinkPageComponent {
  private readonly api = inject(PublicQuickLinkApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly document = inject(DOCUMENT);
  private readonly destroy_ref = inject(DestroyRef);
  private readonly meta = inject(Meta);
  private readonly user_date = new UserDatePipe();

  /** The link's secret token; bound from the `:token` route parameter. */
  public readonly token = input.required<string>();

  /** What the visitor has chosen. */
  public readonly filters = signal<IPublicGamesFilters>({ ...DEFAULT_PUBLIC_FILTERS });

  private readonly query = computed<IPublicGamesQuery>(
    () => build_public_games_query(this.filters()),
    { equal: are_public_queries_equal },
  );

  /** The games for the current token and filters. */
  public readonly games = rxResource({
    params: () => ({ token: this.token(), query: this.query() }),
    stream: ({ params }) => {
      this.last_request_at = Date.now();
      return this.api.list_games(params.token, params.query);
    },
  });

  /** The latest answer, kept while the next one loads or fails so the list never blanks. */
  public readonly result = linkedSignal<
    { token: string; value: IPublicGamesResult | undefined },
    IPublicGamesResult | undefined
  >({
    source: () => ({
      token: this.token(),
      value: this.games.hasValue() ? this.games.value() : undefined,
    }),
    computation: (current, previous) =>
      current.value ?? (previous?.source.token === current.token ? previous.value : undefined),
  });

  /** The sanitized failure of the latest load, or null. */
  private readonly load_error = computed<PublicQuickLinkError | null>(() => {
    const error = this.games.error();
    if (error === undefined) return null;
    return (
      unwrap_public_quick_link_error(error) ??
      new PublicQuickLinkError(PublicLinkErrorKind.UNAVAILABLE, 0)
    );
  });

  /** True for a link that is unknown, expired, revoked or malformed: the page can show nothing else. */
  public readonly is_inactive = computed(
    () => this.load_error()?.kind === PublicLinkErrorKind.NOT_ACTIVE,
  );
  /** A failure with nothing to show yet. */
  public readonly has_blocking_error = computed(
    () => this.load_error() !== null && !this.is_inactive() && this.result() === undefined,
  );
  /** A failed refresh while an earlier answer is still on screen. */
  public readonly has_stale_notice = computed(
    () => this.load_error() !== null && !this.is_inactive() && this.result() !== undefined,
  );
  public readonly error_messages = computed(() => {
    const error = this.load_error();
    return error ? map_public_link_error(error.kind, (key) => this.t(key)) : null;
  });
  public readonly error_icon = computed(() =>
    this.load_error()?.kind === PublicLinkErrorKind.RATE_LIMITED ? 'hourglass_top' : 'error',
  );
  /** Skeletons show until the first answer (or failure) arrives. */
  public readonly is_loading = computed(
    () => this.result() === undefined && this.load_error() === null,
  );
  /** True while a newer answer is on its way and the old one is still on screen. */
  public readonly is_refreshing = computed(
    () => this.result() !== undefined && this.games.isLoading(),
  );

  public readonly shown_count = computed(() => count_public_games(this.result()));
  /** "12 games"; this element is the page live region for the count. */
  public readonly count_text = computed(() =>
    format_games_label(this.shown_count(), (key, params) => this.t(key, params)),
  );
  /** Some matching games are not listed because of the per-response cap. */
  public readonly is_truncated = computed(() => (this.result()?.total ?? 0) > this.shown_count());
  public readonly truncated_text = computed(() =>
    this.t('Showing {{shown}} of {{total}} games. Narrow your search to see the rest.', {
      shown: format_count(this.shown_count()),
      total: format_count(this.result()?.total ?? 0),
    }),
  );
  public readonly has_filters = computed(() => has_active_public_filters(this.filters()));
  public readonly facet_options = computed(() =>
    derive_public_facet_options(this.result(), this.filters()),
  );
  /** "As of 3:04 PM", shown under the title once there is an answer. */
  public readonly as_of_text = computed(() => {
    const result = this.result();
    return result
      ? this.t('As of {{time}}', {
          time: this.user_date.transform(result.as_of, UserDateFormat.TIME_ONLY),
        })
      : undefined;
  });
  /** Refresh sits in the page header; there is nothing to refresh for a dead link. */
  public readonly header_actions = computed<CardHeaderAction[]>(() =>
    this.is_inactive()
      ? []
      : [
          {
            icon: 'refresh',
            label: this.t('Refresh'),
            on_click: () => this.refresh(),
            testid: 'public-refresh',
          },
        ],
  );

  public readonly skeleton_slots = Array.from({ length: PUBLIC_SKELETON_CARD_COUNT }, (_, i) => i);

  private refresh_timer: ReturnType<typeof setInterval> | null = null;
  /** When the latest request started, in local milliseconds. */
  private last_request_at = 0;
  /** Automatic refreshes stay quiet until this local time after a "too many requests". */
  private paused_until = 0;

  /** Named so the very same reference can be removed again on destroy. */
  private readonly on_visibility_change = (): void => {
    if (this.is_page_hidden()) {
      this.stop_auto_refresh();
      return;
    }
    if (this.is_inactive()) return;
    this.start_auto_refresh();
    if (Date.now() - this.last_request_at >= AUTO_REFRESH_INTERVAL_MS) this.auto_refresh();
  };

  public constructor() {
    const robots = this.meta.updateTag(
      { name: ROBOTS_META_NAME, content: 'noindex, nofollow' },
      ROBOTS_META_SELECTOR,
    );
    this.document.addEventListener('visibilitychange', this.on_visibility_change);
    if (!this.is_page_hidden()) this.start_auto_refresh();
    this.destroy_ref.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', this.on_visibility_change);
      this.stop_auto_refresh();
      if (robots) this.meta.removeTagElement(robots);
    });

    effect(() => {
      if (this.is_inactive()) this.stop_auto_refresh();
    });
    effect(() => {
      const error = this.load_error();
      if (!error) return;
      // Only kind, status and code: the original error holds the request address, which holds the token.
      console.error('Could not load the quick link games', {
        kind: error.kind,
        status: error.status,
        code: error.code,
      });
      if (error.kind === PublicLinkErrorKind.RATE_LIMITED) {
        const wait = error.retry_after_ms ?? DEFAULT_RATE_LIMIT_PAUSE_MS;
        this.paused_until = Date.now() + Math.min(wait, MAX_RATE_LIMIT_PAUSE_MS);
      }
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
   * Asks for fresh games now (the Refresh button and the Try again actions). Does nothing while a request is already running.
   * @returns Nothing.
   */
  public refresh(): void {
    if (!this.games.isLoading()) this.games.reload();
  }

  /**
   * Clears search and filters.
   * @returns Nothing.
   */
  public clear_filters(): void {
    this.filters.set({ ...DEFAULT_PUBLIC_FILTERS });
  }

  private is_page_hidden(): boolean {
    return this.document.visibilityState === 'hidden';
  }

  private start_auto_refresh(): void {
    this.stop_auto_refresh();
    this.refresh_timer = setInterval(() => this.auto_refresh(), AUTO_REFRESH_INTERVAL_MS);
  }

  private stop_auto_refresh(): void {
    if (this.refresh_timer !== null) clearInterval(this.refresh_timer);
    this.refresh_timer = null;
  }

  /** One automatic refresh: skipped while hidden, for a dead link, during a rate-limit pause or mid-request. */
  private auto_refresh(): void {
    if (this.is_page_hidden() || this.is_inactive() || Date.now() < this.paused_until) return;
    this.refresh();
  }
}
