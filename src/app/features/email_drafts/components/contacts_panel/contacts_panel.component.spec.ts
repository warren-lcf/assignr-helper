import { TestBed } from '@angular/core/testing';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ALICE, BOB, CAROL_UNSUBSCRIBED, CONTACT_FIXTURES } from '../../mocks/email_contact.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailContact } from '../../models/email_contact.model';
import { ContactsPanelComponent } from './contacts_panel.component';

interface IInputs {
  contacts?: readonly IEmailContact[];
  is_loading?: boolean;
  load_failed?: boolean;
  busy_contact_id?: string | null;
}

function render(inputs: IInputs = {}) {
  TestBed.configureTestingModule({
    imports: [ContactsPanelComponent],
    providers: [{ provide: AppTranslationService, useValue: make_translation_service_double() }],
  });
  const fixture = TestBed.createComponent(ContactsPanelComponent);
  fixture.componentRef.setInput('contacts', [...(inputs.contacts ?? CONTACT_FIXTURES)]);
  fixture.componentRef.setInput('is_loading', inputs.is_loading ?? false);
  fixture.componentRef.setInput('load_failed', inputs.load_failed ?? false);
  fixture.componentRef.setInput('busy_contact_id', inputs.busy_contact_id ?? null);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const component = fixture.componentInstance;
  const events = { add: 0, import: 0, retry: 0, deleted: [] as IEmailContact[] };
  component.add_requested.subscribe(() => events.add++);
  component.import_requested.subscribe(() => events.import++);
  component.retry_requested.subscribe(() => events.retry++);
  component.delete_requested.subscribe((contact) => events.deleted.push(contact));
  return { fixture, component, element, by_testid, events };
}

describe('ContactsPanelComponent', () => {
  it('lists every contact with name and address', () => {
    const { by_testid } = render();

    expect(by_testid('contact-row-contact-1')?.textContent).toContain('Alice Archer');
    expect(by_testid('contact-row-contact-1')?.textContent).toContain('alice@example.test');
    expect(by_testid('contact-row-contact-2')?.textContent).toContain('Bob Baker');
  });

  it('summarizes the list in a polite live region', () => {
    const { by_testid } = render();

    const count = by_testid('contacts-count');
    expect(count?.textContent?.trim()).toBe('3 contacts: 2 can receive email, 1 unsubscribed');
    expect(count?.getAttribute('aria-live')).toBe('polite');
  });

  it('names a single contact in the singular', () => {
    const { by_testid } = render({ contacts: [ALICE] });

    expect(by_testid('contacts-count')?.textContent?.trim()).toBe(
      '1 contact: 1 can receive email, 0 unsubscribed',
    );
  });

  it('marks consent in words and an icon, and an unsubscribed contact with the date', () => {
    const { by_testid } = render();

    expect(by_testid('contact-status-contact-1')?.textContent).toContain('Granted');
    expect(by_testid('contact-status-contact-1')?.textContent).toContain('check_circle');
    const carol = by_testid('contact-status-contact-3');
    expect(carol?.textContent).toContain('Unsubscribed');
    expect(carol?.textContent).toContain('block');
    expect(by_testid('contact-note-contact-3')?.textContent).toContain('Unsubscribed on');
    expect(by_testid('contact-note-contact-3')?.textContent).toContain('2026');
    expect(by_testid('contact-note-contact-1')).toBeNull();
  });

  it('narrows the list by name or address as the search is typed', () => {
    const { by_testid, component, fixture } = render();

    component.search.set('bob@');
    fixture.detectChanges();

    expect(by_testid('contact-row-contact-2')).not.toBeNull();
    expect(by_testid('contact-row-contact-1')).toBeNull();
    expect(component.shown()).toEqual([BOB]);
  });

  it('says so when nothing matches the search', () => {
    const { by_testid, component, fixture } = render();

    component.search.set('zzz');
    fixture.detectChanges();

    expect(by_testid('contacts-no-match')?.textContent).toContain('No contacts match');
    expect(by_testid('contacts-list')).toBeNull();
  });

  it('emits the contact when Delete is pressed, naming them for a screen reader', () => {
    const { by_testid, events } = render();

    const button = by_testid('contact-delete-contact-3');
    expect(button?.getAttribute('aria-label')).toBe('Delete Carol Cruz');
    button?.click();

    expect(events.deleted).toEqual([CAROL_UNSUBSCRIBED]);
  });

  it('shows a spinner on the contact being deleted and disables every delete meanwhile', () => {
    const { by_testid } = render({ busy_contact_id: 'contact-1' });

    const busy = by_testid('contact-delete-contact-1') as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.querySelector('mat-progress-spinner')).not.toBeNull();
    expect((by_testid('contact-delete-contact-2') as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits when Add contact or Paste a list is pressed', () => {
    const { by_testid, events } = render();

    by_testid('contacts-add')?.click();
    by_testid('contacts-import')?.click();

    expect(events.add).toBe(1);
    expect(events.import).toBe(1);
  });

  it('shows skeletons while the contacts load, and no list', () => {
    const { by_testid, element } = render({ is_loading: true, contacts: [] });

    expect(by_testid('contacts-loading')?.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('hch-skeleton-line')).not.toBeNull();
    expect(by_testid('contacts-list')).toBeNull();
  });

  it('shows an error with Try again when the contacts could not be loaded', () => {
    const { by_testid, events } = render({ load_failed: true, contacts: [] });

    expect(by_testid('contacts-error')?.textContent).toContain('Contacts could not be loaded');
    by_testid('contacts-retry')?.click();
    expect(events.retry).toBe(1);
  });

  it('invites the first contact when there are none, and the invitation emits Add', () => {
    const { by_testid, events } = render({ contacts: [] });

    expect(by_testid('contacts-empty')?.textContent).toContain('No contacts yet');
    by_testid('contacts-empty-add')?.click();
    expect(events.add).toBe(1);
  });
});
