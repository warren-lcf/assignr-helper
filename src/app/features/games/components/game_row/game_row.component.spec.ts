import { TestBed } from '@angular/core/testing';
import { USER_DATE_TIMEZONE } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  BARE_GAME,
  CANCELLED_GAME,
  MINE_GAME,
  OPEN_GAME,
  make_game_view,
} from '../../mocks/game_view.mock';
import { GameSlotState } from '../../enums/game_slot_state.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IGameView } from '../../models/game_view.model';
import { GameRowComponent } from './game_row.component';

function render(game: IGameView, viewer_zone?: string) {
  TestBed.configureTestingModule({
    imports: [GameRowComponent],
    providers: [
      { provide: AppTranslationService, useValue: make_translation_service_double() },
      ...(viewer_zone ? [{ provide: USER_DATE_TIMEZONE, useValue: () => viewer_zone }] : []),
    ],
  });
  const fixture = TestBed.createComponent(GameRowComponent);
  fixture.componentRef.setInput('game', game);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, element, by_testid };
}

describe('GameRowComponent', () => {
  it('shows kick-off time, teams, venue and organization', () => {
    const { by_testid, element } = render(OPEN_GAME);

    expect(by_testid('game-time-game-1')?.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(by_testid('game-title-game-1')?.textContent?.trim()).toBe('Lions vs Tigers');
    expect(element.textContent).toContain('Field 3');
    expect(element.textContent).toContain('Metro Youth Soccer');
  });

  it('shows age group, gender, level, league and type as tags', () => {
    const { element } = render(OPEN_GAME);
    const tags = Array.from(element.querySelectorAll('[role="group"] hch-status-chip'))
      .slice(0, 5)
      .map((chip) => chip.textContent?.trim());

    expect(tags).toEqual(['U12', 'Boys', 'Premier', 'Fall League', 'Regular season']);
  });

  it('shows open slots as text and an icon, in the tone for "some are open"', () => {
    const { by_testid } = render(OPEN_GAME);
    const chip = by_testid('game-slots-game-1');

    expect(chip?.textContent).toContain('1 open of 2 slots');
    expect(chip?.textContent).toContain('event_seat');
  });

  it('shows a fully assigned game as "0 open" with a different icon', () => {
    const { by_testid } = render(MINE_GAME);
    const chip = by_testid('game-slots-game-2');

    expect(chip?.textContent).toContain('0 open of 3 slots');
    expect(chip?.textContent).toContain('task_alt');
  });

  it("marks the referee's own game with the position", () => {
    const { by_testid } = render(MINE_GAME);

    expect(by_testid('game-mine-game-2')?.textContent).toContain('Mine: Center');
    expect(by_testid('game-mine-game-2')?.textContent).toContain('person');
  });

  it('says only "Mine" when no position is known, and nothing for games that are not mine', () => {
    const without_position = render(make_game_view({ is_mine: true, my_position: null }));
    expect(without_position.by_testid('game-mine-game-1')?.textContent?.trim()).toContain('Mine');
    expect(without_position.by_testid('game-mine-game-1')?.textContent).not.toContain('Mine:');
    TestBed.resetTestingModule();

    expect(render(OPEN_GAME).by_testid('game-mine-game-1')).toBeNull();
  });

  it('shows a cancelled game as text and an icon, struck through, without a slot count', () => {
    const { by_testid, element } = render(CANCELLED_GAME);

    expect(by_testid('game-cancelled-game-3')?.textContent).toContain('Cancelled');
    expect(by_testid('game-cancelled-game-3')?.textContent).toContain('cancel');
    expect(by_testid('game-slots-game-3')).toBeNull();
    expect(element.querySelector('.game-row--cancelled')).not.toBeNull();
  });

  it('copes with a game that has no teams, venue, organization or tags yet', () => {
    const { by_testid, element } = render(BARE_GAME);

    expect(by_testid('game-title-game-4')?.textContent?.trim()).toBe('Teams to be announced');
    expect(by_testid('game-slots-game-4')?.textContent).toContain('No slots listed');
    expect(element.querySelector('.game-row__meta')).toBeNull();
    expect(element.querySelectorAll('[aria-label="Game details"]')).toHaveLength(0);
  });

  it('shows no fee, whatever the game carries', () => {
    const { element } = render(OPEN_GAME);

    expect(element.textContent).not.toMatch(/\$|fee/i);
  });

  it('names each position and whether it is open, listing open ones first', () => {
    const { by_testid } = render(OPEN_GAME);
    const labels = [0, 1].map(
      (index) => by_testid(`game-position-game-1-${index}`)?.textContent ?? '',
    );

    expect(labels[0]).toContain('Referee: Open');
    expect(labels[1]).toContain('Asst. Referee: Filled');
    expect(by_testid('game-positions-game-1')?.getAttribute('aria-label')).toBe('Positions');
  });

  it('marks the position the referee holds as theirs', () => {
    const { by_testid } = render(MINE_GAME);

    expect(by_testid('game-position-game-2-0')?.textContent).toContain('Center: Yours');
    expect(by_testid('game-position-game-2-2')?.textContent).toContain('Asst. Referee: Filled');
  });

  it('shows every position of a game that has three open', () => {
    const { element } = render(
      make_game_view({
        open_slot_count: 3,
        total_slot_count: 3,
        slots: [
          { position: 'Referee', state: GameSlotState.OPEN },
          { position: 'Asst. Referee', state: GameSlotState.OPEN },
          { position: 'Mentor', state: GameSlotState.OPEN },
        ],
      }),
    );
    const text = element.textContent ?? '';

    expect(text).toContain('3 open of 3 slots');
    expect(text).toContain('Referee: Open');
    expect(text).toContain('Asst. Referee: Open');
    expect(text).toContain('Mentor: Open');
  });

  it('shows no position list for a cancelled game', () => {
    expect(render(CANCELLED_GAME).by_testid('game-positions-game-3')).toBeNull();
  });

  it('shows no position list for a game with no positions', () => {
    expect(render(BARE_GAME).by_testid('game-positions-game-4')).toBeNull();
  });

  it('does not name the location unless asked to', () => {
    expect(render(OPEN_GAME).by_testid('game-location-game-1')).toBeNull();
  });

  it('names the location when the list has no location headings', () => {
    const { fixture, by_testid } = render(OPEN_GAME);
    fixture.componentRef.setInput('show_location', true);
    fixture.detectChanges();

    expect(by_testid('game-location-game-1')?.textContent).toContain('Riverside Park');
  });

  it('does not repeat the location when the venue line already says it', () => {
    const { fixture, by_testid } = render(
      make_game_view({ location_group: 'Field 3', venue_name: 'Field 3' }),
    );
    fixture.componentRef.setInput('show_location', true);
    fixture.detectChanges();

    expect(by_testid('game-location-game-1')).toBeNull();
  });

  it('translates the placeholder for an unknown location', () => {
    const { fixture, by_testid } = render(BARE_GAME);
    fixture.componentRef.setInput('show_location', true);
    fixture.detectChanges();

    expect(by_testid('game-location-game-4')?.textContent).toContain('Location to be announced');
  });

  it('shows no position list when the server sent none', () => {
    expect(
      render(make_game_view({ slots: undefined })).by_testid('game-positions-game-1'),
    ).toBeNull();
  });

  it('shows kick-off on the venue clock with its zone, whatever zone the viewer is in', () => {
    const { by_testid } = render(OPEN_GAME, 'Pacific/Honolulu');

    expect(by_testid('game-time-game-1')?.textContent?.trim()).toMatch(/^9:00\s?AM CDT$/);
  });

  it('falls back to the viewer clock, still naming the zone, when the venue zone is unknown', () => {
    const { by_testid } = render(make_game_view({ time_zone: null }), 'Pacific/Honolulu');

    expect(by_testid('game-time-game-1')?.textContent?.trim()).toMatch(/^4:00\s?AM HST$/);
  });

  it('leaves the time out when the list around it draws the time column', () => {
    const { fixture, by_testid, element } = render(OPEN_GAME);
    fixture.componentRef.setInput('show_time', false);
    fixture.detectChanges();

    expect(by_testid('game-time-game-1')).toBeNull();
    expect(element.querySelector('.game-row__time')).toBeNull();
    // Everything else on the row is still there.
    expect(by_testid('game-title-game-1')?.textContent?.trim()).toBe('Lions vs Tigers');
    expect(by_testid('game-slots-game-1')).not.toBeNull();
  });
});
