import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ViewportService } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DEFAULT_GAMES_FILTERS } from '../../constants/default_games_filters.constant';
import { GamesFilterKey } from '../../enums/games_filter_key.enum';
import { GamesScope } from '../../enums/games_scope.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGamesFacetOptions } from '../../models/games_facet_options.model';
import { IGamesFilters } from '../../models/games_filters.model';
import { GamesFiltersComponent } from './games_filters.component';

const OPTIONS: IGamesFacetOptions = {
  league: ['Fall League', 'Spring League'],
  level: ['Premier', 'Select'],
  age_group: ['U10', 'U12'],
  location_group: ['Riverside Park', 'Location to be announced'],
};

function render(options: { is_mobile?: boolean; filters?: IGamesFilters } = {}) {
  TestBed.configureTestingModule({
    imports: [GamesFiltersComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: ViewportService, useValue: { is_mobile: signal(options.is_mobile ?? false) } },
    ],
  });
  const fixture = TestBed.createComponent(GamesFiltersComponent);
  fixture.componentRef.setInput('filters', options.filters ?? DEFAULT_GAMES_FILTERS);
  fixture.componentRef.setInput('facet_options', OPTIONS);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const component = fixture.componentInstance;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** Opens a mat-select and clicks one of its options in the overlay. */
  const choose = async (testid: string, option_text: string) => {
    by_testid(testid)?.querySelector<HTMLElement>('.mat-mdc-select-trigger')?.click();
    await settle();
    const option = Array.from(document.querySelectorAll<HTMLElement>('mat-option')).find(
      (candidate) => candidate.textContent?.trim() === option_text,
    );
    option?.click();
    await settle();
  };
  return { fixture, component, element, by_testid, settle, choose };
}

describe('GamesFiltersComponent', () => {
  describe('on a wide screen', () => {
    it('shows the scope tabs, search, four facet selects and two toggles, no expansion panel', () => {
      const { element, by_testid } = render();

      expect(
        Array.from(element.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent?.trim()),
      ).toEqual(['Open games', 'My games', 'All games']);
      expect(element.querySelector('hch-filter-bar input')).not.toBeNull();
      for (const id of [
        'games-filter-league',
        'games-filter-level',
        'games-filter-age-group',
        'games-filter-location',
        'games-toggle-open-slots',
        'games-toggle-cancelled',
      ]) {
        expect(by_testid(id)).not.toBeNull();
      }
      expect(by_testid('games-filters-panel')).toBeNull();
    });

    it('marks the current scope as the active tab', () => {
      const { element } = render({
        filters: { ...DEFAULT_GAMES_FILTERS, scope: GamesScope.MINE },
      });
      const active = element.querySelector('[role="tab"][aria-selected="true"]');

      expect(active?.textContent?.trim()).toBe('My games');
    });

    it('switches scope from the tabs', () => {
      const { element, component, fixture } = render();

      Array.from(element.querySelectorAll<HTMLElement>('[role="tab"]'))
        .find((tab) => tab.textContent?.trim() === 'All games')
        ?.click();
      fixture.detectChanges();

      expect(component.filters().scope).toBe(GamesScope.ALL);
    });
  });

  describe('on a phone', () => {
    it('folds facets and toggles into an expansion panel and swaps the tabs for a select', () => {
      const { element, by_testid } = render({ is_mobile: true });

      expect(by_testid('games-filters-panel')).not.toBeNull();
      expect(element.querySelector('[role="tab"]')).toBeNull();
      expect(element.querySelector('hch-responsive-tab-select mat-select')).not.toBeNull();
    });

    it('says how many filters are active in the panel header', () => {
      const { by_testid } = render({
        is_mobile: true,
        filters: { ...DEFAULT_GAMES_FILTERS, league: 'Fall League', include_cancelled: true },
      });

      expect(by_testid('games-filters-panel')?.textContent).toContain('2 active');
    });

    it('says nothing about active filters when there are none', () => {
      const { by_testid } = render({ is_mobile: true });

      expect(by_testid('games-filters-panel')?.textContent).not.toContain('active');
    });
  });

  it('applies the debounced search text', () => {
    const { component } = render();

    component.on_search_changed('lions');

    expect(component.filters().search).toBe('lions');
  });

  it('ignores a scope it does not know', () => {
    const { component } = render();

    component.on_scope_selected('EVERYTHING');

    expect(component.filters().scope).toBe(GamesScope.OPEN);
  });

  it('offers each facet\'s options after "any", and shows the placeholder location translated', async () => {
    const { component, by_testid, settle } = render();

    by_testid('games-filter-location')
      ?.querySelector<HTMLElement>('.mat-mdc-select-trigger')
      ?.click();
    await settle();
    const labels = Array.from(document.querySelectorAll('mat-option')).map((option) =>
      option.textContent?.trim(),
    );

    expect(labels).toEqual(['All locations', 'Riverside Park', 'Location to be announced']);
    expect(component.facet_controls().map((control) => control.key)).toEqual([
      GamesFilterKey.LEAGUE,
      GamesFilterKey.LEVEL,
      GamesFilterKey.AGE_GROUP,
      GamesFilterKey.LOCATION_GROUP,
    ]);
  });

  it('picks a facet value, and "any" clears it', async () => {
    const { component, choose } = render();

    await choose('games-filter-league', 'Spring League');
    expect(component.filters().league).toBe('Spring League');

    await choose('games-filter-league', 'All leagues');
    expect(component.filters().league).toBeNull();
  });

  it('flips the toggles', () => {
    const { component, by_testid, fixture } = render();

    by_testid('games-toggle-open-slots')?.querySelector<HTMLElement>('button')?.click();
    by_testid('games-toggle-cancelled')?.querySelector<HTMLElement>('button')?.click();
    fixture.detectChanges();

    expect(component.filters().only_with_open_slots).toBe(true);
    expect(component.filters().include_cancelled).toBe(true);
  });

  it('shows a removable chip per active filter and removes just that one', () => {
    const { component, element, fixture } = render({
      filters: { ...DEFAULT_GAMES_FILTERS, league: 'Fall League', include_cancelled: true },
    });
    const chips = Array.from(element.querySelectorAll('mat-chip')).map((chip) =>
      chip.textContent?.replace('close', '').trim(),
    );
    expect(chips).toEqual(['League: Fall League', 'Show cancelled']);

    element.querySelector<HTMLElement>('mat-chip button[matChipRemove]')?.click();
    fixture.detectChanges();

    expect(component.filters().league).toBeNull();
    expect(component.filters().include_cancelled).toBe(true);
  });

  it('offers "Clear filters" only while something is active, and clears all but the scope', () => {
    const idle = render();
    expect(idle.by_testid('games-clear-filters')).toBeNull();
    TestBed.resetTestingModule();

    const { component, by_testid, fixture } = render({
      filters: {
        ...DEFAULT_GAMES_FILTERS,
        scope: GamesScope.MINE,
        search: 'lions',
        level: 'Select',
        only_with_open_slots: true,
      },
    });
    const clear = by_testid('games-clear-filters');
    expect(clear?.textContent).toContain('Clear filters');

    clear?.click();
    fixture.detectChanges();

    expect(component.filters()).toEqual({ ...DEFAULT_GAMES_FILTERS, scope: GamesScope.MINE });
    expect(by_testid('games-clear-filters')).toBeNull();
  });

  it('puts the current search into the search field', () => {
    const { element } = render({ filters: { ...DEFAULT_GAMES_FILTERS, search: 'hawks' } });

    expect(element.querySelector<HTMLInputElement>('hch-filter-bar input')?.value).toBe('hawks');
  });
});
