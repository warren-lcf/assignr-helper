import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import {
  ResponsiveTabOption,
  ResponsiveTabSelectComponent,
  ViewportService,
} from '@hch-shared-libraries/ui-kit/core';
import { FilterBarComponent } from '@hch-shared-libraries/ui-kit/data';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DEFAULT_GAMES_FILTERS } from '../../constants/default_games_filters.constant';
import { GAMES_SCOPE_LABEL } from '../../constants/games_scope_label.constant';
import { GamesScope } from '../../enums/games_scope.enum';
import { IGamesFacetOptions } from '../../models/games_facet_options.model';
import { IGamesFilters } from '../../models/games_filters.model';
import { active_filter_chips, has_active_games_filters } from '../../utils/active_filter_chips';
import { format_location_label } from '../../utils/format_location_label';
import { remove_games_filter, set_games_filter } from '../../utils/update_games_filter';
import { GamesFilterKey } from '../../enums/games_filter_key.enum';
import { IGamesFacetControl } from '../../models/games_facet_control.model';

/** The "any value" option of a facet select. A select cannot hold null as a choice, so it is an empty string. */
const ANY_VALUE = '';

/**
 * The Games screen's controls: the scope switch (tabs on a desktop, a select
 * on a phone), the debounced search, the league / level / age group / location
 * selects, the two toggles and the active-filter chips with "Clear filters".
 * On a phone the selects and toggles fold into an expansion panel. It only
 * edits the `filters` model; the page decides what to load.
 */
@Component({
  selector: 'app-games-filters',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSlideToggleModule,
    FilterBarComponent,
    ResponsiveTabSelectComponent,
  ],
  templateUrl: './games_filters.component.html',
  styleUrl: './games_filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamesFiltersComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly viewport = inject(ViewportService);

  /** What the user has chosen; edited in place through the model. */
  public readonly filters = model.required<IGamesFilters>();
  /** The values each select offers. */
  public readonly facet_options = input.required<IGamesFacetOptions>();

  public readonly any_value = ANY_VALUE;
  public readonly location_key = GamesFilterKey.LOCATION_GROUP;
  public readonly is_mobile = this.viewport.is_mobile;

  public readonly scope_options = computed<ResponsiveTabOption[]>(() =>
    Object.values(GamesScope).map((scope) => ({
      value: scope,
      label: this.t(GAMES_SCOPE_LABEL[scope]),
    })),
  );
  public readonly toggle_key = GamesFilterKey;
  public readonly facet_controls = computed<IGamesFacetControl[]>(() => {
    const filters = this.filters();
    const options = this.facet_options();
    return [
      {
        key: GamesFilterKey.LEAGUE,
        label: this.t('League'),
        any_label: this.t('All leagues'),
        testid: 'games-filter-league',
        options: options.league,
        selected: filters.league ?? ANY_VALUE,
      },
      {
        key: GamesFilterKey.LEVEL,
        label: this.t('Level'),
        any_label: this.t('All levels'),
        testid: 'games-filter-level',
        options: options.level,
        selected: filters.level ?? ANY_VALUE,
      },
      {
        key: GamesFilterKey.AGE_GROUP,
        label: this.t('Age group'),
        any_label: this.t('All age groups'),
        testid: 'games-filter-age-group',
        options: options.age_group,
        selected: filters.age_group ?? ANY_VALUE,
      },
      {
        key: GamesFilterKey.LOCATION_GROUP,
        label: this.t('Location'),
        any_label: this.t('All locations'),
        testid: 'games-filter-location',
        options: options.location_group,
        selected: filters.location_group ?? ANY_VALUE,
      },
    ];
  });
  public readonly has_filters = computed(() => has_active_games_filters(this.filters()));
  public readonly chips = computed(() =>
    active_filter_chips(this.filters(), (key, params) => this.t(key, params)),
  );

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
   * Switches scope; an unknown value is ignored.
   * @param value The scope's enum value, as the tab strip or select reports it.
   * @returns Nothing.
   */
  public on_scope_selected(value: string): void {
    const scope = Object.values(GamesScope).find((candidate) => candidate === value);
    if (scope) this.filters.update((filters) => ({ ...filters, scope }));
  }

  /**
   * Applies the debounced search text.
   * @param search The text.
   * @returns Nothing.
   */
  public on_search_changed(search: string): void {
    this.filters.update((filters) => ({ ...filters, search }));
  }

  /**
   * A facet option as shown (only the unknown-location placeholder is translated).
   * @param label The option.
   * @returns The text to show.
   */
  public option_label(label: string): string {
    return format_location_label(label, (key) => this.t(key));
  }

  /**
   * Picks a value for one facet select.
   * @param key Which facet.
   * @param value The chosen value, or the "any" option's empty string.
   * @returns Nothing.
   */
  public on_facet_selected(key: GamesFilterKey, value: string): void {
    this.filters.update((filters) => set_games_filter(filters, key, value));
  }

  /**
   * Flips one of the two toggles.
   * @param key Which toggle.
   * @param checked The new state.
   * @returns Nothing.
   */
  public on_toggle_changed(key: GamesFilterKey, checked: boolean): void {
    this.filters.update((filters) => set_games_filter(filters, key, checked));
  }

  /**
   * Removes one filter, from its chip.
   * @param key The chip's key.
   * @returns Nothing.
   */
  public on_filter_removed(key: string): void {
    this.filters.update((filters) => remove_games_filter(filters, key));
  }

  /**
   * Clears search, facets and toggles; the scope stays.
   * @returns Nothing.
   */
  public on_filters_cleared(): void {
    this.filters.update((filters) => ({ ...DEFAULT_GAMES_FILTERS, scope: filters.scope }));
  }
}
