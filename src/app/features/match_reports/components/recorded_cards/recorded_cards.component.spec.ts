import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IncidentType } from '../../enums/incident_type.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { make_incident } from '../../mocks/match_report.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IIncidentView } from '../../models/incident_view.model';
import { RecordedCardsComponent } from './recorded_cards.component';

const HOME_YELLOW = make_incident();
const AWAY_RED = make_incident({
  incident_id: 'inc-2',
  idempotency_key: 'key-bbbbbbbbbbbb2',
  team_side: TeamSide.AWAY,
  incident_type: IncidentType.RED,
  jersey_number: null,
  minute: 80,
  reason_code: 'VIOLENT_CONDUCT',
});

function render(incidents: IIncidentView[], disabled = false) {
  TestBed.configureTestingModule({
    imports: [RecordedCardsComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(RecordedCardsComponent);
  fixture.componentRef.setInput('incidents', incidents);
  fixture.componentRef.setInput('home_name', 'Lions');
  fixture.componentRef.setInput('away_name', 'Tigers');
  fixture.componentRef.setInput('disabled', disabled);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const removed: IIncidentView[] = [];
  fixture.componentInstance.remove_requested.subscribe((incident) => removed.push(incident));
  const rows = () =>
    Array.from(element.querySelectorAll<HTMLElement>('[data-testid="recorded-card"]'));
  const text_in = (row: HTMLElement, id: string) =>
    row.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();
  return { fixture, element, removed, rows, text_in };
}

describe('RecordedCardsComponent', () => {
  it('says so when no card is recorded', () => {
    const { element, rows } = render([]);

    expect(rows()).toEqual([]);
    expect(element.querySelector('[data-testid="recorded-cards-empty"]')?.textContent).toContain(
      'No cards recorded.',
    );
    expect(element.textContent).toContain('0 cards');
  });

  it('counts the cards, in the singular for one', () => {
    expect(render([HOME_YELLOW]).element.textContent).toContain('1 card');
    TestBed.resetTestingModule();
    expect(render([HOME_YELLOW, AWAY_RED]).element.textContent).toContain('2 cards');
  });

  it('lists each card with its kind, team, number and minute, in the order recorded', () => {
    const { rows, text_in } = render([HOME_YELLOW, AWAY_RED]);

    expect(rows()).toHaveLength(2);
    expect(text_in(rows()[0], 'recorded-card-type')).toBe('Yellow card');
    expect(text_in(rows()[0], 'recorded-card-team')).toBe('Lions');
    expect(text_in(rows()[0], 'recorded-card-number')).toBe('Number 7');
    expect(text_in(rows()[0], 'recorded-card-minute')).toBe('Minute 34');
    expect(text_in(rows()[1], 'recorded-card-type')).toBe('Red card');
    expect(text_in(rows()[1], 'recorded-card-team')).toBe('Tigers');
  });

  it('draws the kind of card with an icon as well as words', () => {
    const { rows } = render([HOME_YELLOW, AWAY_RED]);

    expect(rows()[0].querySelector('mat-icon')?.textContent?.trim()).toBe('crop_portrait');
    expect(rows()[1].querySelector('mat-icon')?.textContent?.trim()).toBe('report');
  });

  it('says "No number" when the player’s number is not known', () => {
    const { rows, text_in } = render([AWAY_RED]);

    expect(text_in(rows()[0], 'recorded-card-number')).toBe('No number');
  });

  it('shows the reason in words, only when there is a known one', () => {
    const { rows, text_in } = render([
      HOME_YELLOW,
      AWAY_RED,
      make_incident({
        incident_id: 'inc-3',
        idempotency_key: 'key-c',
        reason_code: 'FROM_THE_FUTURE',
      }),
    ]);

    expect(rows()[0].querySelector('[data-testid="recorded-card-reason"]')).toBeNull();
    expect(text_in(rows()[1], 'recorded-card-reason')).toBe('Violent conduct');
    expect(rows()[2].querySelector('[data-testid="recorded-card-reason"]')).toBeNull();
  });

  it('leaves the minute out when it is not known', () => {
    const { rows } = render([make_incident({ minute: null })]);

    expect(rows()[0].querySelector('[data-testid="recorded-card-minute"]')).toBeNull();
  });

  it('shows 0 as a minute and a number, not as missing', () => {
    const { rows, text_in } = render([make_incident({ minute: 0, jersey_number: 0 })]);

    expect(text_in(rows()[0], 'recorded-card-minute')).toBe('Minute 0');
    expect(text_in(rows()[0], 'recorded-card-number')).toBe('Number 0');
  });

  it('removes a card with one tap, asking for nothing first', () => {
    const { rows, removed } = render([HOME_YELLOW, AWAY_RED]);

    rows()[1].querySelector<HTMLButtonElement>('[data-testid="recorded-card-remove"]')?.click();

    expect(removed).toEqual([AWAY_RED]);
  });

  it('names each Remove button after its card so no two share a name', () => {
    const { rows } = render([HOME_YELLOW, AWAY_RED]);

    const names = rows().map((row) =>
      row.querySelector('[data-testid="recorded-card-remove"]')?.getAttribute('aria-label'),
    );

    expect(names).toEqual([
      'Remove card 1 (Yellow card for Lions)',
      'Remove card 2 (Red card for Tigers)',
    ]);
  });

  it('cannot remove anything when disabled', () => {
    const { rows } = render([HOME_YELLOW], true);

    const button = rows()[0].querySelector<HTMLButtonElement>(
      '[data-testid="recorded-card-remove"]',
    );

    expect(button?.disabled).toBe(true);
  });
});
