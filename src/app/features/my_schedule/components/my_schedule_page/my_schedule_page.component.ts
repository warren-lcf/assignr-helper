import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import { EmptyStateComponent, SkeletonLineComponent } from '@hch-shared-libraries/ui-kit/core';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GamesErrorKind } from '../../../games/enums/games_error_kind.enum';
import { IGameView } from '../../../games/models/game_view.model';
import { IGamesResult } from '../../../games/models/games_result.model';
import { GamesApiService } from '../../../games/services/games_api.service';
import { flatten_games_by_date } from '../../../games/utils/flatten_games_by_date';
import { format_games_label } from '../../../games/utils/format_games_label';
import { CLOCK_TICK_MS, GAMES_URL, SKELETON_ROW_COUNT } from '../../constants/my_schedule.constant';
import { build_my_schedule_query } from '../../utils/build_my_schedule_query';
import { find_next_game } from '../../utils/find_next_game';
import { map_schedule_load_error } from '../../utils/map_schedule_load_error';
import { CalendarLinkCardComponent } from '../calendar_link_card/calendar_link_card.component';
import { NextUpCardComponent } from '../next_up_card/next_up_card.component';
import { ScheduleAgendaComponent } from '../schedule_agenda/schedule_agenda.component';

/**
 * The My Schedule screen: the referee's next game, their upcoming assigned games by date, and a
 * private calendar link to add them to Google, Apple or Outlook Calendar. Read-only for games; the
 * calendar link card manages itself. Needs `games.read`; without it the screen says so and asks for
 * nothing. A failure to read the calendar link never hides the games, and the other way round.
 */
@Component({
  selector: 'app-my-schedule-page',
  standalone: true,
  imports: [
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    NextUpCardComponent,
    ScheduleAgendaComponent,
    CalendarLinkCardComponent,
  ],
  templateUrl: './my_schedule_page.component.html',
  styleUrl: './my_schedule_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MySchedulePageComponent {
  private readonly games_api = inject(GamesApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly translation = inject(AppTranslationService);

  /** The current time, UTC milliseconds; re-read every minute so "next up" and its note stay current. */
  public readonly now = signal(Date.now());

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_read = computed(() =>
    this.session.permissions().has(PermissionKey.GAMES_READ),
  );

  /** The referee's upcoming games; not requested until permissions are known and allow reading. */
  public readonly games = rxResource({
    params: () => (!this.is_session_pending() && this.can_read() ? true : undefined),
    stream: () => this.games_api.list_games(build_my_schedule_query(Date.now())),
  });
  /** The latest result, kept while a reload runs so the list does not blank. */
  public readonly result = linkedSignal<IGamesResult | undefined, IGamesResult | undefined>({
    source: () => (this.games.hasValue() ? this.games.value() : undefined),
    computation: (current, previous) => current ?? previous?.value,
  });
  /** Every game by calendar date, then start time (games without a date last). */
  public readonly agenda_games = computed<IGameView[]>(() =>
    flatten_games_by_date(this.result()?.locations ?? []).flatMap((date) => date.games),
  );
  public readonly next_game = computed(() => find_next_game(this.agenda_games(), this.now()));
  /** "3 games"; the page's live region for how many games the schedule holds. */
  public readonly count_text = computed(() =>
    format_games_label(this.agenda_games().length, (key, params) => this.t(key, params)),
  );

  /** Skeletons show until permissions are known and the first list has arrived. */
  public readonly is_loading = computed(
    () =>
      this.is_session_pending() ||
      (this.can_read() && this.result() === undefined && this.games.error() === undefined),
  );
  public readonly session_failed = computed(
    () => !this.is_session_pending() && this.session.has_failed(),
  );
  public readonly has_no_access = computed(
    () => !this.is_session_pending() && !this.session.has_failed() && !this.can_read(),
  );
  public readonly load_error = computed(() => {
    const error = this.games.error();
    return error === undefined ? null : map_schedule_load_error(error, (key) => this.t(key));
  });
  /** A refused role cannot be fixed by trying again. */
  public readonly can_retry = computed(
    () => this.load_error()?.kind !== GamesErrorKind.PERMISSION_REQUIRED,
  );

  public readonly skeleton_slots = Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => index);

  public constructor() {
    effect(() => {
      const error = this.games.error();
      if (error) console.error('Could not load the schedule', error);
    });
    const timer = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
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
   * Loads the schedule (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.games.reload();
  }

  /**
   * Sends the referee to the Games screen, where games are found and claimed.
   * @returns Nothing.
   */
  public go_to_games(): void {
    void this.router.navigateByUrl(GAMES_URL);
  }
}
