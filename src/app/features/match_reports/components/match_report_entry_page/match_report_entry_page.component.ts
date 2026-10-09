import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  EmptyStateComponent,
  SkeletonLineComponent,
  ToastService,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { parse_api_error } from '../../../connections/services/parse_api_error';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GamesApiService } from '../../../games/services/games_api.service';
import { format_game_title } from '../../../games/utils/format_game_title';
import { INCIDENT_TYPE_PRESENTATION } from '../../constants/incident_type_presentation.constant';
import { MAX_INCIDENTS, UNDO_TOAST_MS } from '../../constants/match_report_limits.constant';
import { MatchReportErrorCode } from '../../enums/match_report_error_code.enum';
import { ReportErrorKind } from '../../enums/report_error_kind.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { IAddIncidentRequest } from '../../models/add_incident_request.model';
import { IIncidentView } from '../../models/incident_view.model';
import { IReportBlocker } from '../../models/report_blocker.model';
import { IReportOpenResult } from '../../models/report_open_result.model';
import { IScoresChange } from '../../models/scores_change.model';
import { MatchReportSyncService } from '../../services/match_report_sync.service';
import { MatchReportsApiService } from '../../services/match_reports_api.service';
import { build_games_window_query } from '../../utils/build_games_window_query';
import { describe_dropped_operation } from '../../utils/describe_dropped_operation';
import { find_game } from '../../utils/find_game';
import { map_report_api_error } from '../../utils/map_report_api_error';
import { map_report_blockers } from '../../utils/map_report_blockers';
import { unwrap_http_error } from '../../utils/unwrap_http_error';
import { CardEntryPanelComponent } from '../card_entry_panel/card_entry_panel.component';
import { FinishPanelComponent } from '../finish_panel/finish_panel.component';
import { RecordedCardsComponent } from '../recorded_cards/recorded_cards.component';
import { SaveStatusComponent } from '../save_status/save_status.component';
import { ScorePanelComponent } from '../score_panel/score_panel.component';

/** Where the report list lives. */
const REPORTS_URL = '/match-reports';

/** How many skeleton blocks stand in while the report opens. */
const SKELETON_BLOCK_COUNT = 3;

/**
 * The fat-finger screen: one scrollable page where a referee, right after a game, records the final
 * score and any cards. No wizard and no save button: every tap is applied at once and queued by
 * {@link MatchReportSyncService}, which keeps the edits across a poor signal and sends them in order.
 * Needs `games.read` and `reports.write`; without them it says so and makes no request.
 *
 * Opening the page starts the game's report (or returns the one that exists), so reaching it needs a
 * connection once; after that, losing the signal does not lose an edit.
 */
@Component({
  selector: 'app-match-report-entry-page',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    UserDatePipe,
    SaveStatusComponent,
    ScorePanelComponent,
    CardEntryPanelComponent,
    RecordedCardsComponent,
    FinishPanelComponent,
  ],
  providers: [MatchReportSyncService],
  templateUrl: './match_report_entry_page.component.html',
  styleUrl: './match_report_entry_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MatchReportEntryPageComponent {
  private readonly games_api = inject(GamesApiService);
  private readonly reports_api = inject(MatchReportsApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);
  private readonly sync = inject(MatchReportSyncService);

  /** The game to report on, from the route. */
  public readonly game_id = input.required<string>();

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  /** Opening a report starts it (a write) and reads the game, so both permissions are needed. */
  public readonly can_use = computed(
    () =>
      this.session.permissions().has(PermissionKey.GAMES_READ) &&
      this.session.permissions().has(PermissionKey.REPORTS_WRITE),
  );

  /** The report and, when found, its game. Not requested until permissions are known and allow it. */
  public readonly opened = rxResource({
    params: () =>
      !this.is_session_pending() && this.can_use() ? { game_id: this.game_id() } : undefined,
    stream: ({ params }) => this.open(params.game_id),
  });

  /** The report as shown: the server's, with every waiting edit applied. */
  public readonly report = this.sync.report;
  public readonly save_state = this.sync.save_state;
  public readonly pending_count = this.sync.pending_count;
  public readonly is_editable = this.sync.is_editable;

  public readonly game = computed(() => (this.opened.hasValue() ? this.opened.value().game : null));
  public readonly home_name = computed(() => this.game()?.home_team?.trim() || this.t('Home team'));
  public readonly away_name = computed(() => this.game()?.away_team?.trim() || this.t('Away team'));
  public readonly game_title = computed(() => {
    const game = this.game();
    return game === null
      ? this.t('Match report')
      : format_game_title(game, (key, params) => this.t(key, params));
  });
  public readonly kickoff_at = computed(() => this.game()?.start_at ?? null);
  public readonly is_full = computed(() => (this.report()?.incidents.length ?? 0) >= MAX_INCIDENTS);
  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the viewer's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;

  /** What the server said stops the report being marked ready; cleared by the next edit. */
  public readonly blockers = signal<IReportBlocker[]>([]);
  /** True while marking ready or reopening is in flight. */
  public readonly is_busy = signal(false);

  /** Skeletons show until permissions are known and the report has arrived. */
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_use() && this.report() === null && this.opened.error() === undefined),
  );
  public readonly session_failed = computed(
    () => !this.is_session_pending() && this.session.has_failed(),
  );
  public readonly has_no_access = computed(
    () => !this.is_session_pending() && !this.session.has_failed() && !this.can_use(),
  );
  public readonly load_error = computed(() => {
    const error = this.opened.error();
    return error === undefined ? null : map_report_api_error(error, (key) => this.t(key));
  });
  /** A transient failure can pass on retry; a cancelled game or one that is not yours cannot. */
  public readonly can_retry = computed(() => {
    const kind = this.load_error()?.kind;
    return kind === ReportErrorKind.GENERIC || kind === ReportErrorKind.TENANT_REQUIRED;
  });

  public readonly skeleton_slots = Array.from(
    { length: SKELETON_BLOCK_COUNT },
    (_, index) => index,
  );

  public constructor() {
    effect(() => {
      const error = this.opened.error();
      if (error) console.error('Could not open the match report', error);
    });
    effect(() => {
      const result = this.opened.hasValue() ? this.opened.value() : undefined;
      if (result) untracked(() => void this.sync.start(result.report));
    });
    this.sync.dropped_operations.pipe(takeUntilDestroyed()).subscribe((dropped) => {
      this.toast.show_error(
        describe_dropped_operation(dropped, (key, params) => this.t(key, params)),
      );
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
   * Loads the report (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.opened.reload();
  }

  /**
   * Goes back to the list of match reports.
   * @returns Nothing.
   */
  public go_to_list(): void {
    void this.router.navigateByUrl(REPORTS_URL);
  }

  /**
   * The score changed. Applied and queued at once.
   * @param change The new final score.
   * @returns Nothing.
   */
  public on_scores_changed(change: IScoresChange): void {
    this.blockers.set([]);
    void this.sync.set_scores(change.home_score, change.away_score);
  }

  /**
   * A card was added. Applied and queued at once, with an Undo toast for a few seconds.
   * @param request The card.
   * @returns Resolves when the toast has gone.
   */
  public async on_card_added(request: IAddIncidentRequest): Promise<void> {
    this.blockers.set([]);
    void this.sync.add_incident(request);
    const message = this.t('{{card}} added for {{team}}.', {
      card: this.t(INCIDENT_TYPE_PRESENTATION[request.incident_type].label),
      team: request.team_side === TeamSide.HOME ? this.home_name() : this.away_name(),
    });
    const undone = await this.toast.show_action(message, this.t('Undo'), {
      duration_ms: UNDO_TOAST_MS,
    });
    if (undone) await this.sync.remove_incident(request.idempotency_key);
  }

  /**
   * A card was removed. Applied and queued at once, with an Undo toast that puts it back (as a new card with a new
   * idempotency key, unless the removal had not been sent yet).
   * @param incident The card to remove.
   * @returns Resolves when the toast has gone.
   */
  public async on_remove_requested(incident: IIncidentView): Promise<void> {
    this.blockers.set([]);
    void this.sync.remove_incident(incident.idempotency_key);
    const undone = await this.toast.show_action(this.t('Card removed.'), this.t('Undo'), {
      duration_ms: UNDO_TOAST_MS,
    });
    if (undone) await this.sync.restore_incident(incident);
  }

  /**
   * Marks the report ready. When the server says it is not complete, its blockers are listed.
   * @returns Resolves when the call has finished.
   */
  public async on_mark_ready(): Promise<void> {
    if (this.is_busy()) return;
    this.is_busy.set(true);
    this.blockers.set([]);
    try {
      await this.sync.mark_ready();
    } catch (error) {
      const body = parse_api_error(unwrap_http_error(error));
      if (body?.code === MatchReportErrorCode.REPORT_NOT_READY) {
        this.blockers.set(
          map_report_blockers(
            body.violations,
            {
              home_name: this.home_name(),
              away_name: this.away_name(),
              incidents: this.report()?.incidents ?? [],
            },
            (key, params) => this.t(key, params),
          ),
        );
      } else {
        console.error('Could not mark the match report ready', error);
        this.toast.show_error(this.t('The report could not be marked ready. Try again.'));
      }
    } finally {
      this.is_busy.set(false);
    }
  }

  /**
   * Opens a ready report for editing again.
   * @returns Resolves when the call has finished.
   */
  public async on_reopen(): Promise<void> {
    if (this.is_busy()) return;
    this.is_busy.set(true);
    try {
      await this.sync.reopen();
    } catch (error) {
      console.error('Could not reopen the match report', error);
      this.toast.show_error(this.t('The report could not be reopened. Try again.'));
    } finally {
      this.is_busy.set(false);
    }
  }

  /** Starts the game's report and looks the game up; a game that cannot be found does not stop the report. */
  private open(game_id: string): Observable<IReportOpenResult> {
    const game$ = this.games_api.list_games(build_games_window_query(Date.now())).pipe(
      map((result) => find_game(result, game_id)),
      catchError((error: unknown) => {
        console.error('Could not look up the game for the match report', error);
        return of(null);
      }),
    );
    return forkJoin({ report: this.reports_api.open_report(game_id), game: game$ });
  }
}
