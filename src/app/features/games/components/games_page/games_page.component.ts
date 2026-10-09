import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { PageContainerComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  EmptyStateComponent,
  SkeletonLineComponent,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import {
  GroupedAgendaListComponent,
  IAgendaGroupLevel,
  IAgendaItemNoun,
} from '@hch-shared-libraries/ui-kit/data/grouped_agenda_list';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DEFAULT_GAMES_FILTERS } from '../../constants/default_games_filters.constant';
import { GamesErrorKind } from '../../enums/games_error_kind.enum';
import { GamesScope } from '../../enums/games_scope.enum';
import { IGamesFilters } from '../../models/games_filters.model';
import { IGamesQuery } from '../../models/games_query.model';
import { IGamesResult } from '../../models/games_result.model';
import { GamesApiService } from '../../services/games_api.service';
import { has_active_games_filters } from '../../utils/active_filter_chips';
import { are_games_queries_equal } from '../../utils/are_games_queries_equal';
import { build_agenda_date_level } from '../../utils/build_agenda_date_level';
import {
  build_facet_source_query,
  build_games_query,
  has_facet_selection,
} from '../../utils/build_games_query';
import { count_games } from '../../utils/count_games';
import { derive_facet_options } from '../../utils/derive_facet_options';
import { flatten_games_by_date } from '../../utils/flatten_games_by_date';
import { flatten_games_in_order } from '../../utils/flatten_games_in_order';
import { format_count } from '../../utils/format_count';
import { format_games_label } from '../../utils/format_games_label';
import { read_group_by_venue, write_group_by_venue } from '../../utils/group_by_venue_storage';
import { read_last_scope, write_last_scope } from '../../utils/last_scope_storage';
import { format_location_label } from '../../utils/format_location_label';
import { map_games_api_error } from '../../utils/map_games_api_error';
import { GameRowComponent } from '../game_row/game_row.component';
import { GamesFiltersComponent } from '../games_filters/games_filters.component';
import { IGameView } from '../../models/game_view.model';

/** How many location cards of skeleton lines stand in while the first load runs. */
const SKELETON_LOCATION_COUNT = 2;

/** Where the "no games yet" state sends the user to sync. */
const CONNECTIONS_URL = '/connections';

/**
 * The tenant's Games screen: upcoming games from our own copy of the
 * assignors' data, shown in one ui-kit grouped agenda list: by location, then
 * date, then time (or by date and time alone when "Group by venue" is off),
 * with a scope switch, search and filters that all run on the server.
 * Read-only. Needs `games.read`; without it, the screen says so instead of breaking.
 *
 * The facet selects (league, level, age group, location) are filled from a
 * request that carries the scope, search and toggles but none of the facet
 * selections, so choosing one never hides the others' alternatives. With no
 * facet chosen that request is the list itself, so no second call is made.
 */
@Component({
  selector: 'app-games-page',
  standalone: true,
  imports: [
    MatCardModule,
    MatIconModule,
    MatSlideToggleModule,
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonLineComponent,
    GamesFiltersComponent,
    GroupedAgendaListComponent,
    GameRowComponent,
    UserDatePipe,
  ],
  templateUrl: './games_page.component.html',
  styleUrl: './games_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamesPageComponent {
  private readonly api = inject(GamesApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = new UserDatePipe();

  /** What the user has chosen; starts from the scope they last used in this browser. */
  public readonly filters = signal<IGamesFilters>({
    ...DEFAULT_GAMES_FILTERS,
    scope: read_last_scope(),
  });

  /** True while `/api/me` has not answered yet, so "no access" never flashes before permissions load. */
  public readonly is_session_pending = computed(
    () =>
      this.session.is_loading() || (this.session.context() === null && !this.session.has_failed()),
  );
  public readonly can_read = computed(() =>
    this.session.permissions().has(PermissionKey.GAMES_READ),
  );

  /** The query for the list; undefined (no request) until permissions are known and allow reading. */
  private readonly games_query = computed<IGamesQuery | undefined>(
    () =>
      !this.is_session_pending() && this.can_read() ? build_games_query(this.filters()) : undefined,
    { equal: are_games_queries_equal },
  );
  /** The facet-free query; only needed once a facet is chosen, otherwise the list itself answers. */
  private readonly facet_query = computed<IGamesQuery | undefined>(
    () =>
      !this.is_session_pending() && this.can_read() && has_facet_selection(this.filters())
        ? build_facet_source_query(this.filters())
        : undefined,
    { equal: are_games_queries_equal },
  );

  /** The games for the current filters. */
  public readonly games = rxResource({
    params: () => this.games_query(),
    stream: ({ params }) => this.api.list_games(params),
  });
  private readonly facet_games = rxResource({
    params: () => this.facet_query(),
    stream: ({ params }) => this.api.list_games(params),
  });

  /** The latest result, kept while the next one loads so typing in search does not blank the list. */
  public readonly result = linkedSignal<IGamesResult | undefined, IGamesResult | undefined>({
    source: () => (this.games.hasValue() ? this.games.value() : undefined),
    computation: (current, previous) => current ?? previous?.value,
  });
  private readonly facet_result = linkedSignal<IGamesResult | undefined, IGamesResult | undefined>({
    source: () =>
      has_facet_selection(this.filters())
        ? this.facet_games.hasValue()
          ? this.facet_games.value()
          : undefined
        : this.result(),
    computation: (current, previous) => current ?? previous?.value,
  });
  public readonly facet_options = computed(() =>
    derive_facet_options(this.facet_result(), this.filters()),
  );

  public readonly shown_count = computed(() => count_games(this.result()));
  /**
   * True to group games by venue (the default); false for one list by date and time. It only changes
   * how the loaded games are laid out, so nothing is requested again, and it is remembered per browser.
   */
  public readonly group_by_venue = signal(read_group_by_venue());
  /**
   * Every loaded game as the flat list the agenda groups itself: in the server's order (location,
   * then date, then time) when grouped by venue, otherwise by calendar date and then start time.
   */
  public readonly agenda_games = computed<IGameView[]>(() => {
    const locations = this.result()?.locations ?? [];
    return this.group_by_venue()
      ? flatten_games_in_order(locations)
      : flatten_games_by_date(locations).flatMap((date) => date.games);
  });
  /**
   * How the agenda groups the games: location, then date, or the date alone without venue grouping.
   * The labels read the translation signals, so a language switch re-labels the headers.
   */
  public readonly group_levels = computed<IAgendaGroupLevel<IGameView>[]>(() => {
    const date_level = build_agenda_date_level((key) => this.t(key), this.user_date);
    if (!this.group_by_venue()) return [date_level];
    return [
      {
        get_key: (game) => game.location_group,
        get_label: (_key, game) => format_location_label(game.location_group, (key) => this.t(key)),
        icon: 'location_on',
      },
      date_level,
    ];
  });
  /** What one row is called, for the group count chips ("3 games"). */
  public readonly item_noun = computed<IAgendaItemNoun>(() => ({
    one: this.t('game'),
    other: this.t('games'),
  }));
  /** Groups the person has collapsed, by key path. Kept for this visit only, and cleared when the grouping changes. */
  public readonly collapsed_key_paths = signal<readonly (readonly string[])[]>([]);
  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the viewer's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;
  /** "12 games"; this element is the page's live region for result counts. */
  public readonly count_text = computed(() =>
    format_games_label(this.shown_count(), (key, params) => this.t(key, params)),
  );
  public readonly shown_count_text = computed(() => format_count(this.shown_count()));
  public readonly is_truncated = computed(() => this.result()?.truncated === true);
  public readonly has_filters = computed(() => has_active_games_filters(this.filters()));
  /** True while a newer result is on its way and the old one is still on screen. */
  public readonly is_refreshing = computed(
    () => this.result() !== undefined && this.games.isLoading(),
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
    return error === undefined ? null : map_games_api_error(error, (key) => this.t(key));
  });
  /** Invalid filters are fixed by clearing them, a refused role cannot be fixed here, anything else may pass on retry. */
  public readonly error_action_label = computed(() => {
    switch (this.load_error()?.kind) {
      case GamesErrorKind.INVALID_FILTERS:
        return this.t('Clear filters');
      case GamesErrorKind.PERMISSION_REQUIRED:
        return undefined;
      default:
        return this.t('Try again');
    }
  });
  public readonly error_action_testid = computed(() =>
    this.load_error()?.kind === GamesErrorKind.INVALID_FILTERS
      ? 'games-error-clear'
      : 'games-retry',
  );
  public readonly empty_description = computed(() => {
    switch (this.filters().scope) {
      case GamesScope.MINE:
        return this.t(
          'You are not assigned to any upcoming games. Sync a connection to bring in the latest assignments.',
        );
      case GamesScope.ALL:
        return this.t('Sync a connection to bring in games from your assignors.');
      default:
        return this.t(
          'There are no open games right now. Sync a connection to bring in the latest games.',
        );
    }
  });

  public readonly skeleton_slots = Array.from({ length: SKELETON_LOCATION_COUNT }, (_, i) => i);

  public constructor() {
    effect(() => {
      const error = this.games.error();
      if (error) console.error('Could not load the games', error);
    });
    effect(() => {
      const error = this.facet_games.error();
      if (error) console.error('Could not load the filter options', error);
    });
    effect(() => write_last_scope(this.filters().scope));
    effect(() => write_group_by_venue(this.group_by_venue()));
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
   * Switches between games grouped by venue and one list by date and time.
   * @param group_by_venue True to group by venue.
   * @returns Nothing.
   */
  public on_group_by_venue_changed(group_by_venue: boolean): void {
    this.group_by_venue.set(group_by_venue);
    // The collapsed paths belong to the other grouping's levels and would match nothing here.
    this.collapsed_key_paths.set([]);
  }

  /**
   * Identifies a game so its row keeps its DOM when the same game arrives in a new result.
   * @param game The game.
   * @returns The game's id.
   */
  public readonly get_game_key = (game: IGameView): string => game.game_id;

  /**
   * Clears search, facets and toggles; the scope stays.
   * @returns Nothing.
   */
  public clear_filters(): void {
    this.filters.update((filters) => ({ ...DEFAULT_GAMES_FILTERS, scope: filters.scope }));
  }

  /**
   * Runs the error state's action: clear the filters when they were the problem, otherwise try again.
   * @returns Nothing.
   */
  public on_error_action(): void {
    if (this.load_error()?.kind === GamesErrorKind.INVALID_FILTERS) this.clear_filters();
    else this.retry();
  }

  /**
   * Loads the games (or the session, when that is what failed) again.
   * @returns Nothing.
   */
  public retry(): void {
    if (this.session_failed()) this.session.reload();
    else this.games.reload();
  }

  /**
   * Sends the user to Connections, where games are synced in.
   * @returns Nothing.
   */
  public go_to_connections(): void {
    void this.router.navigateByUrl(CONNECTIONS_URL);
  }
}
