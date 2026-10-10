import { TestBed } from '@angular/core/testing';
import { USER_DATE_LOCALE, USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { TRANSLATION_PROVIDER } from '@hch-shared-libraries/ui-kit/core/translation';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  agenda_header_buttons,
  read_agenda_groups,
  read_agenda_labels,
} from '../../../games/mocks/agenda_list_dom.mock';
import { SATURDAY_DATE, SUNDAY_DATE } from '../../../games/mocks/game_view.mock';
import { IGameView } from '../../../games/models/game_view.model';
import {
  SATURDAY_AFTERNOON_GAME,
  SATURDAY_MORNING_GAME,
  SUNDAY_GAME,
  make_my_game,
} from '../../mocks/my_games.mock';
import { make_translation_provider_double } from '../../mocks/translation_provider.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { ScheduleAgendaComponent } from './schedule_agenda.component';

function render(games: IGameView[]) {
  TestBed.configureTestingModule({
    imports: [ScheduleAgendaComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: TRANSLATION_PROVIDER, useValue: make_translation_provider_double() },
      { provide: USER_DATE_TIMEZONE, useValue: () => 'Pacific/Honolulu' },
      { provide: USER_DATE_LOCALE, useValue: () => 'en-US' },
    ],
  });
  const fixture = TestBed.createComponent(ScheduleAgendaComponent);
  fixture.componentRef.setInput('games', games);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, element, by_testid };
}

const ALL_GAMES = [SATURDAY_MORNING_GAME, SATURDAY_AFTERNOON_GAME, SUNDAY_GAME];

describe('ScheduleAgendaComponent', () => {
  it('groups the games by calendar date under weekday headings, earliest first', () => {
    const { element } = render(ALL_GAMES);

    expect(read_agenda_labels(element, 0)).toEqual(['Saturday, Oct 10', 'Sunday, Oct 11']);
    expect(read_agenda_groups(element).map((group) => group.level)).toEqual([0, 0]);
  });

  it('keys each group by the date’s UTC-midnight milliseconds', () => {
    const { element } = render(ALL_GAMES);

    expect(read_agenda_groups(element).map((group) => group.key)).toEqual([
      String(SATURDAY_DATE),
      String(SUNDAY_DATE),
    ]);
  });

  it('counts the games in each group with the game noun', () => {
    const { element } = render(ALL_GAMES);

    expect(read_agenda_groups(element).map((group) => group.count)).toEqual(['2 games', '1 game']);
  });

  it('keeps the order the games come in within a date', () => {
    const { element } = render(ALL_GAMES);
    const titles = Array.from(element.querySelectorAll('[data-testid^="game-title-"]')).map(
      (title) => title.textContent?.trim(),
    );

    expect(titles).toEqual(['Lions vs Tigers', 'Hawks vs Owls', 'Rams vs Bulls']);
  });

  it('draws the kick-off in the list’s time column on the venue’s clock with its zone', () => {
    const { by_testid, element } = render(ALL_GAMES);

    // 14:00 UTC is 9:00 AM in Chicago; the viewer is in Honolulu.
    expect(by_testid('game-time-mine-1')?.textContent?.trim()).toBe('9:00 AM CDT');
    expect(
      element.querySelector('.agenda_row_time [data-testid="game-time-mine-1"]'),
    ).not.toBeNull();
    // The row does not repeat it.
    expect(element.querySelectorAll('[data-testid="game-time-mine-1"]')).toHaveLength(1);
  });

  it('names where each game is, since no venue heading says it', () => {
    const { by_testid } = render(ALL_GAMES);

    expect(by_testid('game-location-mine-1')?.textContent).toContain('Riverside Park');
    expect(by_testid('game-location-mine-2')?.textContent).toContain('Lakeside Fields');
    expect(by_testid('game-row-mine-2')?.textContent).toContain('Pitch 1');
  });

  it('shows the referee’s position and the level and league on each row', () => {
    const { by_testid } = render(ALL_GAMES);

    expect(by_testid('game-mine-mine-1')?.textContent).toContain('Mine: Center');
    expect(by_testid('game-mine-mine-2')?.textContent).toContain('Mine: Asst. Referee');
    expect(by_testid('game-position-mine-1-0')?.textContent).toContain('Center: Yours');
    expect(by_testid('game-row-mine-2')?.textContent).toContain('Select');
    expect(by_testid('game-row-mine-1')?.textContent).toContain('Fall League');
  });

  it('is read-only: no row is a button', () => {
    const { element } = render(ALL_GAMES);

    expect(element.querySelectorAll('[data-testid="grouped-agenda-row"] button')).toHaveLength(0);
    expect(element.querySelectorAll('button[data-testid="grouped-agenda-row"]')).toHaveLength(0);
  });

  it('collapses a date from its header and opens it again', () => {
    const { fixture, element } = render(ALL_GAMES);
    const [saturday] = agenda_header_buttons(element);

    saturday.click();
    fixture.detectChanges();

    expect(read_agenda_groups(element)[0].expanded).toBe(false);
    expect(read_agenda_groups(element)[0].count).toBe('2 games');
    expect(element.querySelector('[data-testid="game-row-mine-1"]')).toBeNull();
    expect(element.querySelector('[data-testid="game-row-mine-3"]')).not.toBeNull();

    agenda_header_buttons(element)[0].click();
    fixture.detectChanges();

    expect(read_agenda_groups(element)[0].expanded).toBe(true);
    expect(element.querySelector('[data-testid="game-row-mine-1"]')).not.toBeNull();
  });

  it('keeps the same day a year apart in two groups', () => {
    const next_year = make_my_game({
      game_id: 'next-year',
      local_date: Date.UTC(2027, 9, 10),
      start_at: Date.UTC(2027, 9, 10, 14),
    });
    const { element } = render([SATURDAY_MORNING_GAME, next_year]);

    expect(read_agenda_groups(element)).toHaveLength(2);
  });

  it('heads games without a date “Date to be announced”', () => {
    const undated = make_my_game({ game_id: 'undated', local_date: null, time_zone: null });
    const { element } = render([SATURDAY_MORNING_GAME, undated]);

    expect(read_agenda_labels(element, 0)).toEqual(['Saturday, Oct 10', 'Date to be announced']);
  });
});
