import { TestBed } from '@angular/core/testing';
import { USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { RIVERSIDE_LOCATION, UNKNOWN_LOCATION } from '../../mocks/game_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGameLocationGroup } from '../../models/game_location_group.model';
import { GameLocationCardComponent } from './game_location_card.component';

function render(location: IGameLocationGroup, index = 0, viewer_zone?: string) {
  TestBed.configureTestingModule({
    imports: [GameLocationCardComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      ...(viewer_zone ? [{ provide: USER_DATE_TIMEZONE, useValue: () => viewer_zone }] : []),
    ],
  });
  const fixture = TestBed.createComponent(GameLocationCardComponent);
  fixture.componentRef.setInput('location', location);
  fixture.componentRef.setInput('index', index);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element };
}

describe('GameLocationCardComponent', () => {
  it('names the location in a level-2 heading with its game count', () => {
    const { element } = render(RIVERSIDE_LOCATION, 2);
    const heading = element.querySelector('[role="heading"][aria-level="2"]');

    expect(heading?.textContent).toContain('Riverside Park');
    expect(heading?.id).toBe('games-location-heading-2');
    expect(element.textContent).toContain('3 games');
    expect(element.querySelector('hch-card-header')).not.toBeNull();
  });

  it('has a heading per date, with the calendar date as the day it names', () => {
    const { element } = render(RIVERSIDE_LOCATION);
    const dates = Array.from(element.querySelectorAll('h3')).map((heading) =>
      heading.textContent?.trim(),
    );

    expect(dates).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
  });

  it("lists each date's games in the order given, as list items", () => {
    const { element } = render(RIVERSIDE_LOCATION);
    const rows = Array.from(element.querySelectorAll('app-game-row [data-testid^="game-row-"]'));

    expect(rows.map((row) => row.getAttribute('data-testid'))).toEqual([
      'game-row-game-1',
      'game-row-game-2',
      'game-row-game-3',
    ]);
    expect(element.querySelectorAll('mat-list-item[role="listitem"]')).toHaveLength(3);
    expect(element.querySelector('mat-list[role="list"]')).not.toBeNull();
  });

  it('separates the games of a date but not after the last one', () => {
    const { element } = render(RIVERSIDE_LOCATION);

    expect(element.querySelectorAll('mat-divider')).toHaveLength(1);
  });

  it('labels each date section by its heading', () => {
    const { element } = render(RIVERSIDE_LOCATION, 1);
    const section = element.querySelector('section');

    expect(section?.getAttribute('aria-labelledby')).toBe('games-date-heading-1-0');
    expect(element.querySelector('#games-date-heading-1-0')?.textContent).toContain(
      'Saturday, Oct 10',
    );
  });

  it('translates the placeholder location and the unknown date', () => {
    const { element } = render(UNKNOWN_LOCATION);

    expect(element.querySelector('[role="heading"]')?.textContent).toContain(
      'Location to be announced',
    );
    expect(element.querySelector('h3')?.textContent).toContain('Date to be announced');
    expect(element.textContent).toContain('1 game');
  });

  it('names the weekday of the calendar date even for a viewer west of UTC', () => {
    const { element } = render(RIVERSIDE_LOCATION, 0, 'Pacific/Honolulu');
    const dates = Array.from(element.querySelectorAll('h3')).map((heading) =>
      heading.textContent?.trim(),
    );

    // A date stored as UTC midnight would read a day early (Friday) if it were formatted in the viewer zone.
    expect(dates).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
  });
});
