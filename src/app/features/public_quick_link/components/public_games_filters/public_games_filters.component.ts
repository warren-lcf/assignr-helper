import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { ViewportService } from '@hch-shared-libraries/ui-kit/core';
import { FilterBarComponent } from '@hch-shared-libraries/ui-kit/data';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DEFAULT_PUBLIC_FILTERS } from '../../constants/default_public_filters.constant';
import { PublicFilterKey } from '../../enums/public_filter_key.enum';
import { IPublicFacetControl } from '../../models/public_facet_control.model';
import { IPublicFacetOptions } from '../../models/public_facet_options.model';
import { IPublicGamesFilters } from '../../models/public_games_filters.model';
import {
  active_public_filter_chips,
  has_active_public_filters,
} from '../../utils/active_public_filter_chips';
import { format_public_location_label } from '../../utils/format_public_location_label';
import { remove_public_filter, set_public_filter } from '../../utils/update_public_filter';

/** The "any value" option of a facet select. A select cannot hold null as a choice, so it is an empty string. */
const ANY_VALUE = '';

/**
 * The public page controls: the debounced search, the level / league /
 * location selects and the active-filter chips with "Clear filters". On a
 * phone the selects fold into an expansion panel so the games stay in view. It
 * only edits the `filters` model; the page decides what to load.
 */
@Component({
  selector: 'app-public-games-filters',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    FilterBarComponent,
  ],
  templateUrl: './public_games_filters.component.html',
  styleUrl: './public_games_filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicGamesFiltersComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly viewport = inject(ViewportService);

  /** What the visitor has chosen; edited in place through the model. */
  public readonly filters = model.required<IPublicGamesFilters>();
  /** The values each select offers. */
  public readonly facet_options = input.required<IPublicFacetOptions>();

  public readonly any_value = ANY_VALUE;
  public readonly location_key = PublicFilterKey.LOCATION_GROUP;
  public readonly is_mobile = this.viewport.is_mobile;

  public readonly facet_controls = computed<IPublicFacetControl[]>(() => {
    const filters = this.filters();
    const options = this.facet_options();
    return [
      {
        key: PublicFilterKey.LEVEL,
        label: this.t('Level'),
        any_label: this.t('All levels'),
        testid: 'public-filter-level',
        options: options.level,
        selected: filters.level ?? ANY_VALUE,
      },
      {
        key: PublicFilterKey.LEAGUE,
        label: this.t('League'),
        any_label: this.t('All leagues'),
        testid: 'public-filter-league',
        options: options.league,
        selected: filters.league ?? ANY_VALUE,
      },
      {
        key: PublicFilterKey.LOCATION_GROUP,
        label: this.t('Location'),
        any_label: this.t('All locations'),
        testid: 'public-filter-location',
        options: options.location_group,
        selected: filters.location_group ?? ANY_VALUE,
      },
    ];
  });
  public readonly has_filters = computed(() => has_active_public_filters(this.filters()));
  public readonly chips = computed(() =>
    active_public_filter_chips(this.filters(), (key, params) => this.t(key, params)),
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
    return format_public_location_label(label, (key) => this.t(key));
  }

  /**
   * Picks a value for one select.
   * @param key Which filter.
   * @param value The chosen value, or the "any" option empty string.
   * @returns Nothing.
   */
  public on_facet_selected(key: PublicFilterKey, value: string): void {
    this.filters.update((filters) => set_public_filter(filters, key, value));
  }

  /**
   * Removes one filter, from its chip.
   * @param key The chip key.
   * @returns Nothing.
   */
  public on_filter_removed(key: string): void {
    this.filters.update((filters) => remove_public_filter(filters, key));
  }

  /**
   * Clears search and facets.
   * @returns Nothing.
   */
  public on_filters_cleared(): void {
    this.filters.set({ ...DEFAULT_PUBLIC_FILTERS });
  }
}
