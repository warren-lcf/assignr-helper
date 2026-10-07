import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { make_public_game } from '../../mocks/public_games_result.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IPublicGame } from '../../models/public_game.model';
import { PublicGameRowComponent } from './public_game_row.component';

function render(game: IPublicGame) {
  TestBed.configureTestingModule({
    imports: [PublicGameRowComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(PublicGameRowComponent);
  fixture.componentRef.setInput('game', game);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return { fixture, element, by_testid };
}

describe('PublicGameRowComponent', () => {
  it('shows the time, the teams, the venue and the tags', () => {
    const { element, by_testid } = render(make_public_game());

    expect(by_testid('public-game-time-g1')?.textContent).toMatch(/\d{1,2}:\d{2}/);
    expect(by_testid('public-game-title-g1')?.textContent?.trim()).toBe('Lions vs Tigers');
    expect(element.textContent).toContain('Field 3');
    expect(element.textContent).toContain('Premier');
    expect(element.textContent).toContain('Fall League');
  });

  it('says "Teams to be announced" when neither team is known', () => {
    const { by_testid } = render(make_public_game({ home_team: null, away_team: null }));

    expect(by_testid('public-game-title-g1')?.textContent?.trim()).toBe('Teams to be announced');
  });

  it('shows open spots as an icon plus text', () => {
    const { by_testid } = render(make_public_game({ open_slot_count: 3 }));
    const spots = by_testid('public-game-spots-g1');

    expect(spots?.textContent).toContain('3 open spots');
    expect(spots?.querySelector('mat-icon')?.textContent?.trim()).toBe('event_seat');
  });

  it('uses the singular for one spot', () => {
    expect(render(make_public_game()).by_testid('public-game-spots-g1')?.textContent).toContain(
      '1 open spot',
    );
  });

  it('shows no open spots with a different icon, not a different colour alone', () => {
    const { by_testid } = render(make_public_game({ open_slot_count: 0 }));
    const spots = by_testid('public-game-spots-g1');

    expect(spots?.textContent).toContain('No open spots');
    expect(spots?.querySelector('mat-icon')?.textContent?.trim()).toBe('block');
  });

  it('leaves out the venue and the tags a game does not have', () => {
    const { element } = render(make_public_game({ venue_name: null, level: null, league: ' ' }));

    expect(element.querySelector('.game-row__meta')).toBeNull();
    expect(element.querySelectorAll('hch-status-chip')).toHaveLength(1);
  });

  it('right-aligns the time with tabular figures', () => {
    const { by_testid } = render(make_public_game());
    const style = getComputedStyle(by_testid('public-game-time-g1') as HTMLElement);

    expect(style.textAlign === 'end' || style.textAlign === 'right').toBe(true);
    expect(style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('never shows a fee', () => {
    const { element } = render(make_public_game());

    expect(element.textContent).not.toMatch(/\$|fee/i);
  });
});
