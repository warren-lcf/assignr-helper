import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { RecipientMode } from '../../enums/recipient_mode.enum';
import { ALICE, BOB, CAROL_UNSUBSCRIBED, make_email_contact } from '../../mocks/email_contact.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailContact } from '../../models/email_contact.model';
import { RecipientPickerComponent } from './recipient_picker.component';

function render(
  options: {
    contacts?: IEmailContact[];
    mode?: RecipientMode;
    selected_ids?: string[];
    is_disabled?: boolean;
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [RecipientPickerComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(RecipientPickerComponent);
  fixture.componentRef.setInput('contacts', options.contacts ?? [ALICE, BOB, CAROL_UNSUBSCRIBED]);
  fixture.componentRef.setInput('mode', options.mode ?? RecipientMode.ALL_CONSENTED);
  fixture.componentRef.setInput('selected_ids', options.selected_ids ?? []);
  fixture.componentRef.setInput('is_disabled', options.is_disabled ?? false);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, component: fixture.componentInstance, element, by_testid, settle };
}

describe('RecipientPickerComponent', () => {
  it('offers everyone who agreed, with the number, and lists no one to choose from', () => {
    const { by_testid, element } = render();

    expect(by_testid('recipient-mode-all')?.textContent).toContain('Everyone who agreed (2)');
    expect(by_testid('recipient-mode-selected')?.textContent).toContain('Choose specific people');
    expect(element.querySelector('mat-selection-list')).toBeNull();
  });

  it('switches to choosing specific people', () => {
    const { component, fixture } = render();

    component.on_mode_changed(RecipientMode.SELECTED);
    fixture.detectChanges();

    expect(component.mode()).toBe(RecipientMode.SELECTED);
    expect(fixture.nativeElement.querySelector('mat-selection-list')).not.toBeNull();
  });

  it('ignores a mode it does not know', () => {
    const { component } = render();

    component.on_mode_changed('SOMETHING_ELSE');

    expect(component.mode()).toBe(RecipientMode.ALL_CONSENTED);
  });

  it('lists every contact as an option, an unsubscribed one marked and not selectable', () => {
    const { by_testid } = render({ mode: RecipientMode.SELECTED });

    expect(by_testid('recipient-option-contact-1')?.textContent).toContain('Alice Archer');
    expect(by_testid('recipient-option-contact-1')?.textContent).toContain('alice@example.test');
    const carol = by_testid('recipient-option-contact-3');
    expect(carol?.textContent).toContain('Unsubscribed');
    expect(carol?.getAttribute('aria-disabled')).toBe('true');
    expect(by_testid('recipient-option-contact-1')?.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('counts the chosen people against the limit of one send', () => {
    const { by_testid } = render({ mode: RecipientMode.SELECTED, selected_ids: ['contact-1'] });

    expect(by_testid('recipient-chosen-count')?.textContent?.trim()).toBe(
      '1 chosen of 100 allowed per send',
    );
    expect(by_testid('recipient-chosen-count')?.getAttribute('aria-live')).toBe('polite');
  });

  it('never counts a chosen contact who unsubscribed', () => {
    const { component } = render({
      mode: RecipientMode.SELECTED,
      selected_ids: ['contact-1', 'contact-3'],
    });

    expect(component.chosen_count()).toBe(1);
  });

  it('selects every consenting contact, and none', async () => {
    const { by_testid, component, settle } = render({ mode: RecipientMode.SELECTED });

    by_testid('recipient-select-all')?.click();
    await settle();
    expect(component.selected_ids()).toEqual(['contact-1', 'contact-2']);

    by_testid('recipient-select-none')?.click();
    await settle();
    expect(component.selected_ids()).toEqual([]);
  });

  it('disables select none while nothing is chosen, and select all when there is no one to choose', () => {
    const empty = render({ mode: RecipientMode.SELECTED, contacts: [CAROL_UNSUBSCRIBED] });

    expect((empty.by_testid('recipient-select-none') as HTMLButtonElement).disabled).toBe(true);
    expect((empty.by_testid('recipient-select-all') as HTMLButtonElement).disabled).toBe(true);
  });

  it('adds and removes a contact as its option is toggled', async () => {
    const { by_testid, component, settle } = render({ mode: RecipientMode.SELECTED });

    by_testid('recipient-option-contact-2')?.click();
    await settle();
    expect(component.selected_ids()).toEqual(['contact-2']);

    by_testid('recipient-option-contact-2')?.click();
    await settle();
    expect(component.selected_ids()).toEqual([]);
  });

  it('never selects an unsubscribed contact, even if told to', () => {
    const { component } = render({ mode: RecipientMode.SELECTED });

    component.on_selection_changed({
      options: [{ value: 'contact-3', selected: true }],
    } as unknown as Parameters<typeof component.on_selection_changed>[0]);

    expect(component.selected_ids()).toEqual([]);
  });

  it('warns when more than one send allows are chosen', () => {
    const contacts = Array.from({ length: 101 }, (_, index) =>
      make_email_contact({ contact_id: `c-${index}`, display_name: `Person ${index}` }),
    );
    const { by_testid, component, fixture } = render({
      mode: RecipientMode.SELECTED,
      contacts,
    });

    component.select_all();
    fixture.detectChanges();

    expect(component.is_over_limit()).toBe(true);
    expect(by_testid('recipient-over-limit')?.getAttribute('role')).toBe('alert');
    expect(by_testid('recipient-over-limit')?.textContent).toContain('at most 100 people');
  });

  it('says so when there are no contacts yet', () => {
    const { by_testid } = render({ mode: RecipientMode.SELECTED, contacts: [] });

    expect(by_testid('recipient-no-contacts')?.textContent).toContain('no contacts yet');
  });

  it('knows whether a contact is chosen or unsubscribed', () => {
    const { component } = render({ selected_ids: ['contact-1'] });

    expect(component.is_chosen(ALICE)).toBe(true);
    expect(component.is_chosen(BOB)).toBe(false);
    expect(component.is_unsubscribed(CAROL_UNSUBSCRIBED)).toBe(true);
    expect(component.is_unsubscribed(ALICE)).toBe(false);
  });
});
