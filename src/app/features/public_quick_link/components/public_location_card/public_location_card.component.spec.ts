import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { RIVERSIDE_LOCATION, UNKNOWN_LOCATION } from '../../mocks/public_games_result.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IPublicLocationGroup } from '../../models/public_location_group.model';
import { PublicLocationCardComponent } from './public_location_card.component';

function render(location: IPublicLocationGroup, index = 0) {
  TestBed.configureTestingModule({
    imports: [PublicLocationCardComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(PublicLocationCardComponent);
  fixture.componentRef.setInput('location', location);
  fixture.componentRef.setInput('index', index);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element };
}

describe('PublicLocationCardComponent', () => {
  it('titles the card with the location and counts its games', () => {
    const { element } = render(RIVERSIDE_LOCATION);

    expect(element.querySelector('[role="heading"]')?.textContent).toContain('Riverside Park');
    expect(element.textContent).toContain('3 games');
  });

  it('has a heading per date, each labelling its own section, with the games in order', () => {
    const { element } = render(RIVERSIDE_LOCATION, 2);
    const sections = element.querySelectorAll('section');

    expect(sections).toHaveLength(2);
    expect(sections[0].getAttribute('aria-labelledby')).toBe('public-date-heading-2-0');
    expect(element.querySelector('#public-date-heading-2-0')?.textContent).toContain(
      'Saturday, Oct 10',
    );
    expect(
      Array.from(sections[0].querySelectorAll('[data-testid^="public-game-title-"]')).map((node) =>
        node.textContent?.trim(),
      ),
    ).toEqual(['Lions vs Tigers', 'Hawks vs Owls']);
  });

  it('says "Date to be announced" for a game with no date, and translates the placeholder location', () => {
    const { element } = render(UNKNOWN_LOCATION);

    expect(element.textContent).toContain('Date to be announced');
    expect(element.textContent).toContain('Location to be announced');
    expect(element.textContent).toContain('1 game');
  });

  it('gives each card unique ids', () => {
    const { element } = render(RIVERSIDE_LOCATION, 5);

    expect(element.querySelector('[data-testid="public-location-5"]')).not.toBeNull();
    expect(element.querySelector('#public-location-heading-5')).not.toBeNull();
  });
});
