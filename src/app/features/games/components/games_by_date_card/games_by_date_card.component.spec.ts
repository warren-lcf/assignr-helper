import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  BARE_GAME,
  MINE_GAME,
  OPEN_GAME,
  SATURDAY_DATE,
  SUNDAY_DATE,
  make_date_group,
  make_game_view,
} from '../../mocks/game_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGameDateGroup } from '../../models/game_date_group.model';
import { GamesByDateCardComponent } from './games_by_date_card.component';

function render(dates: IGameDateGroup[]) {
  TestBed.configureTestingModule({
    imports: [GamesByDateCardComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(GamesByDateCardComponent);
  fixture.componentRef.setInput('dates', dates);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element };
}

describe('GamesByDateCardComponent', () => {
  it('has one heading naming the list and its game count, and no venue headings', () => {
    const { element } = render([
      make_date_group(SATURDAY_DATE, [OPEN_GAME, MINE_GAME]),
      make_date_group(SUNDAY_DATE, [make_game_view({ game_id: 'sun' })]),
    ]);
    const heading = element.querySelector('[role="heading"][aria-level="2"]');

    expect(heading?.textContent).toContain('Games by date');
    expect(element.textContent).toContain('3 games');
    expect(element.querySelectorAll('[role="heading"][aria-level="2"]')).toHaveLength(1);
  });

  it('has a heading per date with its games under it in the order given', () => {
    const { element } = render([
      make_date_group(SATURDAY_DATE, [OPEN_GAME, MINE_GAME]),
      make_date_group(SUNDAY_DATE, [make_game_view({ game_id: 'sun' })]),
    ]);
    const dates = Array.from(element.querySelectorAll('h3')).map((heading) =>
      heading.textContent?.trim(),
    );
    const rows = Array.from(element.querySelectorAll('[data-testid^="game-row-"]')).map((row) =>
      row.getAttribute('data-testid'),
    );

    expect(dates).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
    expect(rows).toEqual(['game-row-game-1', 'game-row-game-2', 'game-row-sun']);
  });

  it('names where each game is played, since no location heading does', () => {
    const { element } = render([make_date_group(SATURDAY_DATE, [OPEN_GAME])]);

    expect(element.querySelector('[data-testid="game-location-game-1"]')?.textContent).toContain(
      'Riverside Park',
    );
  });

  it('says "Date to be announced" for games without a date', () => {
    const { element } = render([make_date_group(null, [BARE_GAME])]);

    expect(element.querySelector('h3')?.textContent?.trim()).toBe('Date to be announced');
  });
});
