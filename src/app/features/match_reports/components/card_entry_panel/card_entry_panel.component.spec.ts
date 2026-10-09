import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IncidentType } from '../../enums/incident_type.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IAddIncidentRequest } from '../../models/add_incident_request.model';
import { CardEntryPanelComponent } from './card_entry_panel.component';

const MINUTE = 60_000;
const KICKOFF = Date.UTC(2026, 9, 10, 14, 0, 0);

interface IRenderOptions {
  kickoff_at?: number | null;
  disabled?: boolean;
  is_full?: boolean;
}

function render(options: IRenderOptions = {}) {
  TestBed.configureTestingModule({
    imports: [CardEntryPanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(CardEntryPanelComponent);
  fixture.componentRef.setInput('home_name', 'Lions');
  fixture.componentRef.setInput('away_name', 'Tigers');
  fixture.componentRef.setInput('kickoff_at', options.kickoff_at ?? null);
  fixture.componentRef.setInput('disabled', options.disabled ?? false);
  fixture.componentRef.setInput('is_full', options.is_full ?? false);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const cards: IAddIncidentRequest[] = [];
  fixture.componentInstance.card_added.subscribe((card) => cards.push(card));
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const click = (id: string) => {
    by_testid(id)?.click();
    fixture.detectChanges();
  };
  const press_digits = (digits: string) => {
    for (const digit of digits) click(`big-numpad-key-${digit}`);
  };
  const choose = (team: TeamSide, card: IncidentType) => {
    click(`choice-tile-${team}`);
    click(`choice-tile-${card}`);
  };
  const add_button = () => by_testid('card-add') as HTMLButtonElement;
  const readout = () => by_testid('big-numpad-value')?.textContent?.trim();
  const minute_shown = () =>
    by_testid('card-minute')
      ?.querySelector('[data-testid="score-stepper-value"]')
      ?.textContent?.trim();
  return {
    fixture,
    element,
    cards,
    by_testid,
    click,
    press_digits,
    choose,
    add_button,
    readout,
    minute_shown,
  };
}

describe('CardEntryPanelComponent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('what it offers', () => {
    it('offers the two teams by name, with their side, and the three cards', () => {
      const { by_testid } = render();

      expect(by_testid('card-team')?.textContent).toContain('Lions (home)');
      expect(by_testid('card-team')?.textContent).toContain('Tigers (away)');
      const types = by_testid('card-type')?.textContent ?? '';
      expect(types).toContain('Yellow card');
      expect(types).toContain('Second yellow');
      expect(types).toContain('Red card');
    });

    it('shows every card with an icon as well as words', () => {
      const { by_testid } = render();

      const icons = Array.from(
        by_testid('card-type')?.querySelectorAll('.hch_choice_icon_box mat-icon') ?? [],
        (icon) => icon.textContent?.trim(),
      );

      expect(icons).toEqual(['crop_portrait', 'style', 'report']);
    });

    it('offers the six reasons as toggle chips', () => {
      const { by_testid } = render();

      const labels = Array.from(
        by_testid('card-reason')?.querySelectorAll('button') ?? [],
        (button) => button.textContent?.trim(),
      );

      expect(labels).toEqual([
        'Dissent',
        'Foul play',
        'Persistent infringement',
        'Unsporting behaviour',
        'Serious foul play',
        'Violent conduct',
      ]);
    });
  });

  describe('adding a card', () => {
    it('cannot be added until a team and a card are chosen, and says why', () => {
      const { add_button, click, by_testid } = render();

      expect(add_button().disabled).toBe(true);
      expect(by_testid('card-add-hint')?.textContent).toContain(
        'Choose a team and a card to add it.',
      );
      click('choice-tile-HOME');
      expect(add_button().disabled).toBe(true);
      click('choice-tile-RED');
      expect(add_button().disabled).toBe(false);
      expect(by_testid('card-add-hint')?.textContent?.trim()).toBe('');
    });

    it('hands over the card with a fresh 32 character key', () => {
      const { choose, click, cards } = render();

      choose(TeamSide.AWAY, IncidentType.SECOND_YELLOW);
      click('card-add');

      expect(cards).toHaveLength(1);
      expect(cards[0]).toEqual({
        idempotency_key: expect.stringMatching(/^[0-9a-f]{32}$/),
        team_side: TeamSide.AWAY,
        incident_type: IncidentType.SECOND_YELLOW,
        jersey_number: null,
        minute: 1,
        reason_code: null,
        notes: null,
      });
    });

    it('marks the chosen tiles as selected', () => {
      const { choose, by_testid } = render();

      choose(TeamSide.HOME, IncidentType.YELLOW);

      expect(by_testid('choice-tile-HOME')?.getAttribute('aria-checked')).toBe('true');
      expect(by_testid('choice-tile-AWAY')?.getAttribute('aria-checked')).toBe('false');
      expect(by_testid('choice-tile-YELLOW')?.getAttribute('aria-checked')).toBe('true');
      expect(by_testid('choice-tile-RED')?.getAttribute('aria-checked')).toBe('false');
    });

    it('lets the choice be changed before adding', () => {
      const { click, cards, choose } = render();

      choose(TeamSide.HOME, IncidentType.YELLOW);
      click('choice-tile-AWAY');
      click('choice-tile-RED');
      click('card-add');

      expect(cards[0]).toMatchObject({ team_side: TeamSide.AWAY, incident_type: IncidentType.RED });
    });

    it('clears everything for the next card after one is added, team included', () => {
      const { choose, click, press_digits, by_testid, readout, add_button, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);
      press_digits('12');
      click('card-reason-DISSENT');

      click('card-add');

      expect(cards).toHaveLength(1);
      expect(by_testid('choice-tile-HOME')?.getAttribute('aria-checked')).toBe('false');
      expect(by_testid('choice-tile-YELLOW')?.getAttribute('aria-checked')).toBe('false');
      expect(readout()).toBe('');
      expect(by_testid('card-reason-DISSENT')?.getAttribute('aria-pressed')).toBe('false');
      expect(add_button().disabled).toBe(true);
    });

    it('adds nothing when pressed without a team and a card', () => {
      const { fixture, cards } = render();

      fixture.componentInstance.on_add();

      expect(cards).toEqual([]);
    });

    it('cannot add when disabled, even with a team and a card chosen', () => {
      const { choose, add_button, fixture, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      expect(add_button().disabled).toBe(true);
      fixture.componentInstance.on_add();
      expect(cards).toEqual([]);
    });

    it('cannot add when the report already holds as many cards as it can, and says so', () => {
      const { choose, add_button, by_testid, fixture } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);
      fixture.componentRef.setInput('is_full', true);
      fixture.detectChanges();

      expect(add_button().disabled).toBe(true);
      expect(by_testid('card-add-hint')?.textContent).toContain(
        'This report already holds the most cards it can.',
      );
    });
  });

  describe('the player number', () => {
    it('shows what is typed big, and sends it as a number', () => {
      const { choose, press_digits, readout, click, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);

      press_digits('7');
      press_digits('3');
      expect(readout()).toBe('73');
      click('card-add');

      expect(cards[0].jersey_number).toBe(73);
    });

    it('takes at most two digits', () => {
      const { press_digits, readout } = render();

      press_digits('123');

      expect(readout()).toBe('12');
    });

    it('takes the last digit back with backspace', () => {
      const { press_digits, click, readout } = render();
      press_digits('45');

      click('big-numpad-backspace');

      expect(readout()).toBe('4');
    });

    it('sends 0 as a number, not as "no number"', () => {
      const { choose, press_digits, click, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);

      press_digits('0');
      click('card-add');

      expect(cards[0].jersey_number).toBe(0);
    });

    it('sends no number when none was typed', () => {
      const { choose, click, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);

      click('card-add');

      expect(cards[0].jersey_number).toBeNull();
    });

    it('"No number" clears the digits, is shown as pressed, and sends no number', () => {
      const { choose, press_digits, click, by_testid, readout, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);
      press_digits('12');

      click('card-no-number');

      expect(readout()).toBe('');
      expect(by_testid('card-no-number')?.getAttribute('aria-pressed')).toBe('true');
      expect(by_testid('card-no-number')?.querySelector('mat-icon')?.textContent?.trim()).toBe(
        'check',
      );
      click('card-add');
      expect(cards[0].jersey_number).toBeNull();
    });

    it('pressing "No number" again takes it back', () => {
      const { click, by_testid } = render();

      click('card-no-number');
      click('card-no-number');

      expect(by_testid('card-no-number')?.getAttribute('aria-pressed')).toBe('false');
    });

    it('typing a digit cancels "No number"', () => {
      const { click, press_digits, by_testid, readout } = render();
      click('card-no-number');

      press_digits('9');

      expect(by_testid('card-no-number')?.getAttribute('aria-pressed')).toBe('false');
      expect(readout()).toBe('9');
    });

    it('"Clear" wipes the digits and "No number"', () => {
      const { click, press_digits, readout, by_testid } = render();
      press_digits('88');

      click('card-clear-number');
      expect(readout()).toBe('');

      click('card-no-number');
      click('card-clear-number');
      expect(by_testid('card-no-number')?.getAttribute('aria-pressed')).toBe('false');
    });
  });

  describe('the minute', () => {
    it('starts at the whole minutes since kick-off', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(KICKOFF + 34 * MINUTE + 20_000);
      const { choose, click, minute_shown, cards } = render({ kickoff_at: KICKOFF });

      expect(minute_shown()).toBe('34');
      choose(TeamSide.HOME, IncidentType.YELLOW);
      click('card-add');

      expect(cards[0].minute).toBe(34);
    });

    it('is minute 1 when the kick-off is not known', () => {
      const { minute_shown } = render({ kickoff_at: null });

      expect(minute_shown()).toBe('1');
    });

    it('goes up and down a minute with the big buttons, and sends the chosen minute', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(KICKOFF + 34 * MINUTE);
      const { fixture, element, choose, click, minute_shown, cards } = render({
        kickoff_at: KICKOFF,
      });
      choose(TeamSide.HOME, IncidentType.YELLOW);

      element.querySelector<HTMLButtonElement>('button[aria-label="One minute later"]')?.click();
      fixture.detectChanges();
      expect(minute_shown()).toBe('35');
      click('card-add');

      expect(cards[0].minute).toBe(35);
    });

    it('jumps to a shortcut minute', () => {
      const { choose, click, minute_shown, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);

      click('minute-quick-75');
      expect(minute_shown()).toBe('75');
      click('card-add');

      expect(cards[0].minute).toBe(75);
    });

    it('starts again from the clock for the next card, not from the last chosen minute', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(KICKOFF + 10 * MINUTE);
      const { choose, click, minute_shown, cards } = render({ kickoff_at: KICKOFF });
      choose(TeamSide.HOME, IncidentType.YELLOW);
      click('minute-quick-90');
      click('card-add');

      vi.setSystemTime(KICKOFF + 40 * MINUTE);
      choose(TeamSide.AWAY, IncidentType.RED);
      expect(minute_shown()).toBe('40');
      click('card-add');

      expect(cards.map((card) => card.minute)).toEqual([90, 40]);
    });

    it('keeps the default fresh while the panel is being filled in', () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(KICKOFF + MINUTE + 5000);
      const { click, minute_shown } = render({ kickoff_at: KICKOFF });
      expect(minute_shown()).toBe('1');

      vi.setSystemTime(KICKOFF + 20 * MINUTE);
      click('choice-tile-HOME');

      expect(minute_shown()).toBe('20');
    });
  });

  describe('the reason', () => {
    it('is optional and sent as a stable code', () => {
      const { choose, click, cards } = render();
      choose(TeamSide.HOME, IncidentType.RED);

      click('card-reason-SERIOUS_FOUL_PLAY');
      click('card-add');

      expect(cards[0].reason_code).toBe('SERIOUS_FOUL_PLAY');
    });

    it('shows the chosen reason as pressed and ticked, and one reason at a time', () => {
      const { click, by_testid } = render();

      click('card-reason-DISSENT');
      click('card-reason-FOUL_PLAY');

      expect(by_testid('card-reason-DISSENT')?.getAttribute('aria-pressed')).toBe('false');
      expect(by_testid('card-reason-FOUL_PLAY')?.getAttribute('aria-pressed')).toBe('true');
      expect(
        by_testid('card-reason-FOUL_PLAY')?.querySelector('mat-icon')?.textContent?.trim(),
      ).toBe('check');
    });

    it('pressing the chosen reason again takes it back', () => {
      const { choose, click, cards } = render();
      choose(TeamSide.HOME, IncidentType.YELLOW);

      click('card-reason-DISSENT');
      click('card-reason-DISSENT');
      click('card-add');

      expect(cards[0].reason_code).toBeNull();
    });
  });

  describe('when it cannot be edited', () => {
    it('disables every control', () => {
      const { element } = render({ disabled: true });

      // The keypad keys stay focusable when disabled, so they are told apart by aria-disabled.
      const enabled = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).filter(
        (button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true',
      );

      expect(enabled.map((button) => button.textContent?.trim())).toEqual([]);
      expect(
        element.querySelector('[data-testid="choice-tile-HOME"]')?.getAttribute('aria-disabled'),
      ).toBe('true');
    });
  });
});
