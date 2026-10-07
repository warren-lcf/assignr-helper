import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { ViewportService } from '@hch-shared-libraries/ui-kit/core';
import { signal } from '@angular/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { DEFAULT_PUBLIC_FILTERS } from '../../constants/default_public_filters.constant';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IPublicFacetOptions } from '../../models/public_facet_options.model';
import { IPublicGamesFilters } from '../../models/public_games_filters.model';
import { PublicGamesFiltersComponent } from './public_games_filters.component';

const OPTIONS: IPublicFacetOptions = {
  level: ['Premier', 'Select'],
  league: ['Fall League'],
  location_group: ['Riverside Park', 'Location to be announced'],
};

function render(filters: IPublicGamesFilters = { ...DEFAULT_PUBLIC_FILTERS }, is_mobile = false) {
  const translation = make_translation_service_double();
  TestBed.configureTestingModule({
    imports: [PublicGamesFiltersComponent],
    providers: [
      { provide: AppTranslationService, useValue: translation },
      {
        provide: TRANSLATION_PROVIDER,
        useValue: { ...translation, active_locale: signal('en'), set_active_locale: vi.fn() },
      },
      { provide: ViewportService, useValue: { is_mobile: signal(is_mobile) } },
    ],
  });
  const fixture = TestBed.createComponent(PublicGamesFiltersComponent);
  fixture.componentRef.setInput('filters', filters);
  fixture.componentRef.setInput('facet_options', OPTIONS);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    fixture.detectChanges();
    fixture.detectChanges();
  };
  return { fixture, component: fixture.componentInstance, element, by_testid, settle };
}

describe('PublicGamesFiltersComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers a search and a select each for level, league and location', () => {
    const { by_testid, element } = render();

    expect(element.querySelector('input')).not.toBeNull();
    expect(by_testid('public-filter-level')).not.toBeNull();
    expect(by_testid('public-filter-league')).not.toBeNull();
    expect(by_testid('public-filter-location')).not.toBeNull();
    expect(by_testid('public-clear-filters')).toBeNull();
  });

  it('puts the selects in an expansion panel on a phone', () => {
    const { by_testid } = render(undefined, true);

    expect(by_testid('public-filters-panel')).not.toBeNull();
  });

  it('builds a control per facet from the options and the current choice', () => {
    const { component, fixture } = render({ ...DEFAULT_PUBLIC_FILTERS, level: 'Select' });
    fixture.detectChanges();

    const controls = component.facet_controls();
    expect(controls.map((control) => control.testid)).toEqual([
      'public-filter-level',
      'public-filter-league',
      'public-filter-location',
    ]);
    expect(controls[0]).toMatchObject({ selected: 'Select', options: OPTIONS.level });
    expect(controls[1].selected).toBe('');
  });

  it('applies a picked facet to the filters model', () => {
    const { component } = render();

    component.on_facet_selected(component.facet_controls()[0].key, 'Premier');

    expect(component.filters().level).toBe('Premier');
  });

  it('shows a removable chip per facet and a Clear filters button when something is set', () => {
    const { component, by_testid } = render({ ...DEFAULT_PUBLIC_FILTERS, league: 'Fall League' });

    expect(component.chips().map((chip) => chip.label)).toEqual(['League: Fall League']);
    expect(by_testid('public-clear-filters')).not.toBeNull();
  });

  it('removes a facet from its chip and keeps the rest', () => {
    const { component } = render({
      search: 'lions',
      level: 'Premier',
      league: 'Fall League',
      location_group: null,
    });

    component.on_filter_removed(component.chips()[0].key);

    expect(component.filters()).toEqual({
      search: 'lions',
      level: null,
      league: 'Fall League',
      location_group: null,
    });
  });

  it('clears search and facets', () => {
    const { component, by_testid, fixture } = render({
      search: 'lions',
      level: 'Premier',
      league: null,
      location_group: null,
    });

    by_testid('public-clear-filters')?.click();
    fixture.detectChanges();

    expect(component.filters()).toEqual(DEFAULT_PUBLIC_FILTERS);
  });

  it('translates only the unknown-location placeholder in the location options', () => {
    const { component } = render();

    expect(component.option_label('Location to be announced')).toBe('Location to be announced');
    expect(component.option_label('Riverside Park')).toBe('Riverside Park');
  });

  it('waits for the typing to pause before it changes the search', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { component, element, fixture } = render();
    const input = element.querySelector('input') as HTMLInputElement;

    input.value = 'lio';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    input.value = 'lions';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(component.filters().search).toBe('');

    vi.advanceTimersByTime(150);
    fixture.detectChanges();

    expect(component.filters().search).toBe('lions');
  });
});
