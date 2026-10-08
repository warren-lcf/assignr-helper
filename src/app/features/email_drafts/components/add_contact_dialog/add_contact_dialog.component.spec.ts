import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ALICE } from '../../mocks/email_contact.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailContact } from '../../models/email_contact.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { AddContactDialogComponent } from './add_contact_dialog.component';

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

function render(create_contact: () => Observable<IEmailContact> = () => of(ALICE)) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { create_contact: vi.fn(create_contact) };
  TestBed.configureTestingModule({
    imports: [AddContactDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: EmailContactsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(AddContactDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const type = (id: string, value: string) => {
    const input = by_testid(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const tick_consent = () => {
    by_testid('add-contact-consent')?.querySelector<HTMLInputElement>('input')?.click();
    fixture.detectChanges();
  };
  const submit = async () => {
    by_testid('add-contact-submit')?.click();
    fixture.detectChanges();
    await settle();
  };
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    dialog_ref,
    by_testid,
    settle,
    type,
    tick_consent,
    submit,
  };
}

describe('AddContactDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('asks for a name, an address and the consent confirmation, worded clearly', () => {
    const { by_testid, element } = render();

    expect(element.querySelector('h2')?.textContent).toContain('Add contact');
    expect(by_testid('add-contact-name')).not.toBeNull();
    expect(by_testid('add-contact-email')).not.toBeNull();
    expect(by_testid('add-contact-consent')?.textContent).toContain(
      'I confirm this person agreed to receive these emails',
    );
  });

  it('sends nothing, and says why under the checkbox, when consent is not ticked', async () => {
    const { api, by_testid, submit, type, dialog_ref } = render();

    type('add-contact-name', 'Alice Archer');
    type('add-contact-email', 'alice@example.test');
    await submit();

    expect(api.create_contact).not.toHaveBeenCalled();
    expect(dialog_ref.close).not.toHaveBeenCalled();
    expect(by_testid('add-contact-consent-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('add-contact-consent-error')?.textContent).toContain(
      'Confirm that this person agreed to receive these emails.',
    );
  });

  it('shows no consent error before the first attempt', () => {
    const { by_testid } = render();

    expect(by_testid('add-contact-consent-error')?.textContent?.trim()).toBe('');
  });

  it('attests the consent in the request and closes with the new contact', async () => {
    const { api, dialog_ref, submit, type, tick_consent } = render();

    type('add-contact-name', '  Alice Archer ');
    type('add-contact-email', ' alice@example.test ');
    tick_consent();
    await submit();

    expect(api.create_contact).toHaveBeenCalledWith({
      display_name: 'Alice Archer',
      email_address: 'alice@example.test',
      consent_attested: true,
    });
    expect(dialog_ref.close).toHaveBeenCalledWith(ALICE);
  });

  it('asks for a name and a valid address before sending anything', async () => {
    const { api, element, submit, tick_consent, type } = render();

    tick_consent();
    type('add-contact-email', 'nope');
    await submit();

    expect(api.create_contact).not.toHaveBeenCalled();
    const errors = Array.from(element.querySelectorAll('mat-error')).map((e) => e.textContent);
    expect(errors.join(' ')).toContain('Enter a name.');
    expect(errors.join(' ')).toContain('Enter a valid email address.');
  });

  it('rejects a name that is too long', async () => {
    const { api, element, submit, tick_consent, type } = render();

    tick_consent();
    type('add-contact-name', 'N'.repeat(101));
    type('add-contact-email', 'alice@example.test');
    await submit();

    expect(api.create_contact).not.toHaveBeenCalled();
    expect(element.textContent).toContain('The name can be at most 100 characters.');
  });

  it('shows an address that already exists under the address field and stays open', async () => {
    const { by_testid, dialog_ref, element, submit, tick_consent, type } = render(() =>
      throwError(() => api_failure(409, 'CONTACT_EXISTS')),
    );

    type('add-contact-name', 'Alice Again');
    type('add-contact-email', 'alice@example.test');
    tick_consent();
    await submit();

    expect(element.querySelector('mat-error')?.textContent).toContain(
      'A contact with this email address already exists.',
    );
    expect(dialog_ref.close).not.toHaveBeenCalled();
    expect((by_testid('add-contact-submit') as HTMLButtonElement).disabled).toBe(false);
    expect(logged).toHaveBeenCalledWith('Could not add the contact', expect.anything());
  });

  it('shows a server validation message under its field', async () => {
    const { element, submit, tick_consent, type } = render(() =>
      throwError(() =>
        api_failure(400, 'VALIDATION_ERROR', [
          { path: 'display_name', message: 'Name has odd characters' },
        ]),
      ),
    );

    type('add-contact-name', 'Alice');
    type('add-contact-email', 'alice@example.test');
    tick_consent();
    await submit();

    expect(element.querySelector('mat-error')?.textContent).toContain('Name has odd characters');
  });

  it('shows a translated message for any other failure, never the server wording', async () => {
    const { by_testid, submit, tick_consent, type } = render(() =>
      throwError(() => api_failure(500, 'INTERNAL')),
    );

    type('add-contact-name', 'Alice');
    type('add-contact-email', 'alice@example.test');
    tick_consent();
    await submit();

    expect(by_testid('add-contact-form-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('add-contact-form-error')?.textContent).toContain(
      'Something went wrong. Try again.',
    );
    expect(by_testid('add-contact-form-error')?.textContent).not.toContain('server text');
  });

  it('disables the buttons and shows a spinner while the request is in flight', async () => {
    const pending = new Subject<IEmailContact>();
    const { by_testid, dialog_ref, fixture, submit, tick_consent, type } = render(() => pending);

    type('add-contact-name', 'Alice');
    type('add-contact-email', 'alice@example.test');
    tick_consent();
    await submit();
    fixture.detectChanges();

    const button = by_testid('add-contact-submit') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('mat-progress-spinner')).not.toBeNull();
    expect((by_testid('add-contact-cancel') as HTMLButtonElement).disabled).toBe(true);
    // Escape and a click outside are ignored while the request runs.
    expect(dialog_ref.disableClose).toBe(true);
  });
});
