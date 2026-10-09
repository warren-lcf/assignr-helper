import { TestBed } from '@angular/core/testing';
import { USER_DATE_LOCALE, USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SATURDAY_DATE, make_game_view } from '../../../games/mocks/game_view.mock';
import { IGameView } from '../../../games/models/game_view.model';
import { SATURDAY_MORNING_GAME, make_my_game } from '../../mocks/my_games.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { NextUpCardComponent } from './next_up_card.component';

const HOUR = 3_600_000;
/** Three hours before SATURDAY_MORNING_GAME kicks off (14:00 UTC). */
const THREE_HOURS_BEFORE = SATURDAY_MORNING_GAME.start_at - 3 * HOUR;

function render(game: IGameView | null, now: number = THREE_HOURS_BEFORE) {
  TestBed.configureTestingModule({
    imports: [NextUpCardComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      { provide: USER_DATE_TIMEZONE, useValue: () => 'Pacific/Honolulu' },
      { provide: USER_DATE_LOCALE, useValue: () => 'en-US' },
    ],
  });
  const fixture = TestBed.createComponent(NextUpCardComponent);
  fixture.componentRef.setInput('game', game);
  fixture.componentRef.setInput('now', now);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, element, by_testid };
}

describe('NextUpCardComponent', () => {
  it('is headed "Next up"', () => {
    const { element } = render(SATURDAY_MORNING_GAME);

    expect(element.querySelector('[role="heading"][aria-level="2"]')?.textContent).toContain(
      'Next up',
    );
  });

  it('names the teams', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    expect(by_testid('next-up-title')?.textContent?.trim()).toBe('Lions vs Tigers');
  });

  it('shows the weekday and calendar date, not the viewerâ€™s day', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    expect(by_testid('next-up-date')?.textContent?.trim()).toBe('Saturday, Oct 10');
  });

  it('shows kick-off on the venueâ€™s clock with its zone, whatever zone the viewer is in', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    // 14:00 UTC is 9:00 AM in Chicago (CDT); the viewer is in Honolulu.
    expect(by_testid('next-up-time')?.textContent?.trim()).toBe('9:00 AM CDT');
  });

  it('names the venue’s calendar day even when the viewer’s own day is the one before', () => {
    // 03:00 UTC on Saturday is Saturday afternoon in Auckland but Friday evening in Honolulu.
    const game = make_game_view({
      local_date: SATURDAY_DATE,
      start_at: SATURDAY_DATE + 3 * HOUR,
      time_zone: 'Pacific/Auckland',
    });
    const { by_testid } = render(game);

    expect(by_testid('next-up-date')?.textContent?.trim()).toBe('Saturday, Oct 10');
  });

  it('dates a game without a calendar date by its kick-off on its own clock', () => {
    const game = make_game_view({
      local_date: null,
      start_at: SATURDAY_DATE + 3 * HOUR,
      time_zone: 'Pacific/Auckland',
    });
    const { by_testid } = render(game);

    // 03:00 UTC on the 10th is Saturday afternoon in Auckland, though still Friday evening for the Honolulu viewer.
    expect(by_testid('next-up-date')?.textContent?.trim()).toBe('Saturday, Oct 10');
  });

  it('names the venue, and the location only when it is a different place', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    expect(by_testid('next-up-venue')?.textContent).toContain('Field 3');
    expect(by_testid('next-up-location')?.textContent).toContain('Riverside Park');
  });

  it('leaves out the location line when the venue already says it', () => {
    const { by_testid } = render(make_my_game({ venue_name: 'Riverside Park' }));

    expect(by_testid('next-up-venue')?.textContent).toContain('Riverside Park');
    expect(by_testid('next-up-location')).toBeNull();
  });

  it('leaves out the venue line when the game has no venue yet', () => {
    const { by_testid } = render(make_my_game({ venue_name: null }));

    expect(by_testid('next-up-venue')).toBeNull();
  });

  it('shows the refereeâ€™s position as a chip', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    expect(by_testid('next-up-position')?.textContent).toContain('Your position: Center');
  });

  it('says only that the referee is assigned when the position is not named', () => {
    const { by_testid } = render(make_my_game({ my_position: null }));

    expect(by_testid('next-up-position')?.textContent).toContain('You are assigned');
  });

  it('shows the age group, level and league as tags', () => {
    const { element } = render(SATURDAY_MORNING_GAME);
    const chips = Array.from(element.querySelectorAll('hch-status-chip')).map((chip) =>
      chip.textContent?.trim(),
    );

    expect(chips).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Your position'),
        'U12',
        'Premier',
        'Fall League',
      ]),
    );
  });

  it('says how long until a game that has not started', () => {
    const { by_testid } = render(SATURDAY_MORNING_GAME);

    expect(by_testid('next-up-note')?.textContent).toContain('Starts in 3 hours');
    expect(by_testid('next-up-note')?.textContent).toContain('hourglass_top');
  });

  it('says how long ago a game under way started', () => {
    const { by_testid } = render(
      SATURDAY_MORNING_GAME,
      SATURDAY_MORNING_GAME.start_at + 20 * 60_000,
    );

    expect(by_testid('next-up-note')?.textContent).toContain('Started 20 minutes ago');
    expect(by_testid('next-up-note')?.textContent).toContain('play_circle');
  });

  it('keeps the note current when the clock moves on', () => {
    const { fixture, by_testid } = render(SATURDAY_MORNING_GAME);

    fixture.componentRef.setInput('now', SATURDAY_MORNING_GAME.start_at - HOUR);
    fixture.detectChanges();

    expect(by_testid('next-up-note')?.textContent).toContain('Starts in 1 hour');
  });

  it('says nothing is coming up when there is no game, and draws none of the details', () => {
    const { by_testid, element } = render(null);

    expect(by_testid('next-up-empty')?.textContent).toContain('Nothing coming up');
    expect(by_testid('next-up-title')).toBeNull();
    expect(element.querySelector('hch-status-chip')).toBeNull();
  });
});
