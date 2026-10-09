import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import { EmptyStateComponent, SkeletonLineComponent } from '@hch-shared-libraries/ui-kit/core';
import { forkJoin, map } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GamesApiService } from '../../../games/services/games_api.service';
import { flatten_games_in_order } from '../../../games/utils/flatten_games_in_order';
import { format_game_title } from '../../../games/utils/format_game_title';
import { ReportErrorKind } from '../../enums/report_error_kind.enum';
import { IGameReportEntry } from '../../models/game_report_entry.model';
import { IReportListSections } from '../../models/report_list_sections.model';
import { MatchReportsApiService } from '../../services/match_reports_api.service';
import { build_games_window_query } from '../../utils/build_games_window_query';
import { build_report_list_sections } from '../../utils/build_report_list_sections';
import { map_report_api_error } from '../../utils/map_report_api_error';
import { ReportGameRowComponent } from '../report_game_row/report_game_row.component';

/** How many skeleton rows stand in while the first load runs. */
const SKELETON_ROW_COUNT = 3;

/** Where the empty state sends the referee to find games. */
const GAMES_URL = '/games';

/** Where a report is edited; the game's id follows. */
const REPORT_URL_PREFIX = '/match-reports';

const NO_SECTIONS: IReportListSections = { needs_report: [], reported: [] };

/**
 * The "Today" list of the Match reports screen: the referee's games from the last seven days that have
 * started, split into those that still need a report and those that have one. One giant button at the top
 * opens the most recent game that needs a report. Reading needs `games.read`; opening a report needs
 * `reports.write`. Without `games.read` the screen says so and makes no request.
 */
@Component({
  selector: 'app-match-reports-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    ReportGameRowComponent,
  ],
  templateUrl: './match_reports_page.component.html',
  styleUrl: './match_reports_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchReportsPageComponent {
  private readonly games_api = inject(GamesApiService);
  private readonly reports_api = inject(MatchReportsApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly translation = inject(AppTranslationService);

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_read = computed(() =>
    this.session.permissions().has(PermissionKey.GAMES_READ),
  );
  public readonly can_write = computed(() =>
    this.session.permissions().has(PermissionKey.REPORTS_WRITE),
  );

  /** The recent games with their reports; not requested until permissions are known and allow reading. */
  public readonly data = rxResource({
    params: () => (!this.is_session_pending() && this.can_read() ? true : undefined),
    stream: () => {
      const now = Date.now();
      return forkJoin({
        games: this.games_api.list_games(build_games_window_query(now)),
        reports: this.reports_api.list_reports(),
      }).pipe(
        map(({ games, reports }) =>
          build_report_list_sections(flatten_games_in_order(games.locations), reports, now),
        ),
      );
    },
  });

  public readonly sections = computed(() =>
    this.data.hasValue() ? this.data.value() : NO_SECTIONS,
  );
  public readonly needs_report = computed(() => this.sections().needs_report);
  public readonly reported = computed(() => this.sections().reported);
  public readonly is_empty = computed(
    () => this.needs_report().length === 0 && this.reported().length === 0,
  );
  /** The most recent game that still needs a report, for the big button; null for a reader who cannot write. */
  public readonly top_entry = computed<IGameReportEntry | null>(() =>
    this.can_write() ? (this.needs_report()[0] ?? null) : null,
  );
  public readonly top_title = computed(() => {
    const entry = this.top_entry();
    return entry === null
      ? ''
      : format_game_title(entry.game, (key, params) => this.t(key, params));
  });
  /** "2 games need a report"; the page's live region for how the list loaded. */
  public readonly count_text = computed(() => {
    const count = this.needs_report().length;
    if (count === 0) return this.t('No games need a report');
    return count === 1
      ? this.t('1 game needs a report')
      : this.t('{{count}} games need a report', { count });
  });

  /** Skeletons show until permissions are known and the first list has arrived. */
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_read() && !this.data.hasValue() && this.data.error() === undefined),
  );
  public readonly session_failed = computed(
    () => !this.is_session_pending() && this.session.has_failed(),
  );
  public readonly has_no_access = computed(
    () => !this.is_session_pending() && !this.session.has_failed() && !this.can_read(),
  );
  public readonly load_error = computed(() => {
    const error = this.data.error();
    if (error === undefined) return null;
    const mapped = map_report_api_error(error, (key) => this.t(key));
    // The mapper words a generic failure for one report; this screen loads the list.
    return mapped.kind === ReportErrorKind.GENERIC
      ? { ...mapped, headline: this.t('Match reports could not be loaded') }
      : mapped;
  });
  /** A refused role cannot be fixed by trying again. */
  public readonly can_retry = computed(
    () => this.load_error()?.kind !== ReportErrorKind.PERMISSION_REQUIRED,
  );

  public readonly skeleton_slots = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index);

  public constructor() {
    effect(() => {
      const error = this.data.error();
      if (error) console.error('Could not load the match reports', error);
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
   * Loads the list (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.data.reload();
  }

  /**
   * Opens a game's report.
   * @param entry The game (and report) to open.
   * @returns Nothing.
   */
  public open_report(entry: IGameReportEntry): void {
    void this.router.navigateByUrl(
      `${REPORT_URL_PREFIX}/${encodeURIComponent(entry.game.game_id)}`,
    );
  }

  /**
   * Sends the referee to Games, where games are found.
   * @returns Nothing.
   */
  public go_to_games(): void {
    void this.router.navigateByUrl(GAMES_URL);
  }
}
