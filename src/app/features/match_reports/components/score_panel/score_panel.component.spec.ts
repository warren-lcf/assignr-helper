import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IScoresChange } from '../../models/scores_change.model';
import { ScorePanelComponent } from './score_panel.component';

interface IRenderOptions {
  home_score?: number | null;
  away_score?: number | null;
  disabled?: boolean;
}

function render(options: IRenderOptions = {}) {
  TestBed.configureTestingModule({
    imports: [ScorePanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(ScorePanelComponent);
  fixture.componentRef.setInput('home_name', 'Lions');
  fixture.componentRef.setInput('away_name', 'Tigers');
  fixture.componentRef.setInput('home_score', options.home_score ?? null);
  fixture.componentRef.setInput('away_score', options.away_score ?? null);
  fixture.componentRef.setInput('disabled', options.disabled ?? false);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const changes: IScoresChange[] = [];
  fixture.componentInstance.scores_changed.subscribe((change) => changes.push(change));
  const button = (name: string) =>
    Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.getAttribute('aria-label') === name,
    );
  const value_of = (side: 'home' | 'away') =>
    element
      .querySelector(`[data-testid="score-${side}"] [data-testid="score-stepper-value"]`)
      ?.textContent?.trim();
  return { fixture, element, changes, button, value_of };
}

describe('ScorePanelComponent', () => {
  it('shows one stepper per team, named after the team and its side', () => {
    const { element } = render();
    const groups = Array.from(element.querySelectorAll('[role="group"]')).map((group) =>
      group.getAttribute('aria-label'),
    );

    expect(groups).toEqual(['Lions (home)', 'Tigers (away)']);
  });

  it('shows the scores, and 0 for one that is not entered', () => {
    const { value_of } = render({ home_score: 3, away_score: null });

    expect(value_of('home')).toBe('3');
    expect(value_of('away')).toBe('0');
  });

  it('names the buttons after the team: add and remove a goal', () => {
    const { button } = render({ home_score: 1, away_score: 1 });

    expect(button('Add a goal for Lions')).toBeDefined();
    expect(button('Remove a goal for Lions')).toBeDefined();
    expect(button('Add a goal for Tigers')).toBeDefined();
    expect(button('Remove a goal for Tigers')).toBeDefined();
  });

  it('reports the home score at once when a goal is added, with the away score beside it', () => {
    const { button, changes } = render({ home_score: 1, away_score: 2 });

    button('Add a goal for Lions')?.click();

    expect(changes).toEqual([{ home_score: 2, away_score: 2 }]);
  });

  it('reports the away score when a goal is removed', () => {
    const { button, changes } = render({ home_score: 1, away_score: 2 });

    button('Remove a goal for Tigers')?.click();

    expect(changes).toEqual([{ home_score: 1, away_score: 1 }]);
  });

  it('sets the other team to 0 when the first score is entered, so a result is never half there', () => {
    const { button, changes } = render({ home_score: null, away_score: null });

    button('Add a goal for Tigers')?.click();

    expect(changes).toEqual([{ home_score: 0, away_score: 1 }]);
  });

  it('cannot go below 0 or above 99', () => {
    const { button } = render({ home_score: 0, away_score: 99 });

    expect(button('Remove a goal for Lions')?.disabled).toBe(true);
    expect(button('Add a goal for Tigers')?.disabled).toBe(true);
    expect(button('Add a goal for Lions')?.disabled).toBe(false);
  });

  it('says no score is entered yet and offers a one-tap 0 – 0 until both are entered', () => {
    const { element, changes } = render();

    expect(element.querySelector('[data-testid="score-unset-note"]')?.textContent).toContain(
      'No score entered yet.',
    );
    element.querySelector<HTMLButtonElement>('[data-testid="score-confirm-goalless"]')?.click();

    expect(changes).toEqual([{ home_score: 0, away_score: 0 }]);
  });

  it('offers no 0 – 0 shortcut once both scores are entered', () => {
    const { element } = render({ home_score: 0, away_score: 0 });

    expect(element.querySelector('[data-testid="score-confirm-goalless"]')).toBeNull();
    expect(element.querySelector('[data-testid="score-unset-note"]')).toBeNull();
  });

  it('is read-only when the report cannot be edited', () => {
    const { element, button } = render({ disabled: true });

    for (const name of [
      'Add a goal for Lions',
      'Remove a goal for Lions',
      'Add a goal for Tigers',
      'Remove a goal for Tigers',
    ]) {
      expect(button(name)?.disabled, name).toBe(true);
    }
    expect(element.querySelector('[data-testid="score-confirm-goalless"]')).toBeNull();
  });

  it('shows the allowed range', () => {
    const { element } = render();

    expect(element.textContent).toContain('0 to 99');
  });
});
