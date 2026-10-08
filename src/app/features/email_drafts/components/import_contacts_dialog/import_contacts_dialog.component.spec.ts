import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IImportContactsRequest } from '../../models/import_contacts_request.model';
import { IImportContactsResult } from '../../models/import_contacts_result.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { ImportContactsDialogComponent } from './import_contacts_dialog.component';

const RESULT: IImportContactsResult = {
  added: 2,
  skipped_existing: 1,
  invalid: [{ row: 3, reason: 'Domain not accepted' }],
};

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

function render(
  import_contacts: (request: IImportContactsRequest) => Observable<IImportContactsResult> = () =>
    of(RESULT),
) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { import_contacts: vi.fn(import_contacts) };
  TestBed.configureTestingModule({
    imports: [ImportContactsDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: EmailContactsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(ImportContactsDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const paste = (text: string) => {
    const area = by_testid('import-text') as HTMLTextAreaElement;
    area.value = text;
    area.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const tick_consent = () => {
    by_testid('import-consent')?.querySelector<HTMLInputElement>('input')?.click();
    fixture.detectChanges();
  };
  const submit = async () => {
    by_testid('import-submit')?.click();
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
    paste,
    tick_consent,
    submit,
  };
}

const TWO_VALID = 'Eve Evans <eve@example.test>\nfrank@example.test';

describe('ImportContactsDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('explains the format and the limit, and asks for the consent confirmation', () => {
    const { by_testid } = render();

    expect(by_testid('import-intro')?.textContent).toContain('"Name <email>"');
    expect(by_testid('import-intro')?.textContent).toContain('Up to 200 lines');
    expect(by_testid('import-consent')?.textContent).toContain(
      'I confirm these people agreed to receive these emails',
    );
  });

  it('counts what is ready and what will be skipped as the text is pasted', () => {
    const { by_testid, paste } = render();

    paste('Eve <eve@example.test>\nnot an email\nfrank@example.test\nFrank <FRANK@example.test>');

    expect(by_testid('import-summary')?.textContent?.trim()).toBe('2 ready to import, 2 skipped');
    expect(by_testid('import-summary')?.getAttribute('aria-live')).toBe('polite');
  });

  it('lists each unusable line with its reason', () => {
    const { by_testid, paste } = render();

    paste('not an email\nfrank@example.test\nfrank@example.test');

    const problems = by_testid('import-problems')?.textContent ?? '';
    expect(problems).toContain('Line 1: Not a valid email address');
    expect(problems).toContain('not an email');
    expect(problems).toContain('Line 3: This address is repeated from an earlier line');
  });

  it('lists only the first unusable lines and counts the rest', () => {
    const { by_testid, paste } = render();

    paste(Array.from({ length: 25 }, (_, index) => `bad-${index}`).join('\n'));

    expect(by_testid('import-problems')?.querySelectorAll('li')).toHaveLength(20);
    expect(by_testid('import-problems')?.textContent).toContain('and 5 more');
  });

  it('sends nothing, and says why under the checkbox, when consent is not ticked', async () => {
    const { api, by_testid, paste, submit } = render();

    paste(TWO_VALID);
    await submit();

    expect(api.import_contacts).not.toHaveBeenCalled();
    expect(by_testid('import-consent-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('import-consent-error')?.textContent).toContain(
      'Confirm that these people agreed to receive these emails.',
    );
  });

  it('refuses an empty paste and a paste with nothing usable', async () => {
    const { api, element, paste, submit, tick_consent } = render();

    tick_consent();
    await submit();
    expect(element.querySelector('mat-error')?.textContent).toContain(
      'Paste at least one valid line.',
    );

    paste('nothing usable here');
    await submit();
    expect(api.import_contacts).not.toHaveBeenCalled();
  });

  it('refuses more than 200 contacts', async () => {
    const { api, element, paste, submit, tick_consent } = render();

    paste(Array.from({ length: 201 }, (_, index) => `p${index}@example.test`).join('\n'));
    tick_consent();
    await submit();

    expect(api.import_contacts).not.toHaveBeenCalled();
    expect(element.querySelector('mat-error')?.textContent).toContain(
      'Paste at most 200 contacts at a time. You pasted 201.',
    );
  });

  it('sends the usable lines with the consent attestation, skipping the rest', async () => {
    const { api, paste, submit, tick_consent } = render();

    paste(`${TWO_VALID}\nnot an email`);
    tick_consent();
    await submit();

    expect(api.import_contacts).toHaveBeenCalledWith({
      entries: [
        { display_name: 'Eve Evans', email_address: 'eve@example.test' },
        { email_address: 'frank@example.test' },
      ],
      consent_attested: true,
    });
  });

  it('shows what the server did, with right-aligned numbers, and the rows it refused', async () => {
    const { by_testid, element, paste, submit, tick_consent } = render();

    paste(TWO_VALID);
    tick_consent();
    await submit();

    expect(element.querySelector('h2')?.textContent).toContain('Import finished');
    expect(by_testid('import-result-added')?.textContent?.trim()).toBe('2');
    expect(by_testid('import-result-existing')?.textContent?.trim()).toBe('1');
    expect(by_testid('import-result-invalid')?.textContent?.trim()).toBe('1');
    expect(by_testid('import-result-invalid-list')?.textContent).toContain(
      'Row 3: Domain not accepted',
    );
    expect(by_testid('import-text')).toBeNull();
  });

  it('closes with the summary on Done', async () => {
    const { by_testid, dialog_ref, fixture, paste, submit, tick_consent } = render();

    paste(TWO_VALID);
    tick_consent();
    await submit();
    by_testid('import-done')?.click();
    fixture.detectChanges();

    expect(dialog_ref.close).toHaveBeenCalledWith(RESULT);
  });

  it('shows a translated message and stays open when the import fails', async () => {
    const { by_testid, dialog_ref, paste, submit, tick_consent } = render(() =>
      throwError(() => api_failure(500, 'INTERNAL')),
    );

    paste(TWO_VALID);
    tick_consent();
    await submit();

    expect(by_testid('import-form-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('import-form-error')?.textContent).toContain(
      'Something went wrong. Try again.',
    );
    expect(by_testid('import-form-error')?.textContent).not.toContain('server text');
    expect(dialog_ref.close).not.toHaveBeenCalled();
    expect(by_testid('import-text')).not.toBeNull();
    expect(logged).toHaveBeenCalledWith('Could not import the contacts', expect.anything());
  });

  it('shows the server wording for a rejected list in the form message', async () => {
    const { by_testid, paste, submit, tick_consent } = render(() =>
      throwError(() =>
        api_failure(400, 'VALIDATION_ERROR', [{ path: 'entries', message: 'Too many entries' }]),
      ),
    );

    paste(TWO_VALID);
    tick_consent();
    await submit();

    expect(by_testid('import-form-error')?.textContent).toContain('Too many entries');
  });

  it('disables the buttons while the request is in flight', async () => {
    const pending = new Subject<IImportContactsResult>();
    const { by_testid, dialog_ref, fixture, paste, submit, tick_consent } = render(() => pending);

    paste(TWO_VALID);
    tick_consent();
    await submit();
    fixture.detectChanges();

    const button = by_testid('import-submit') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((by_testid('import-cancel') as HTMLButtonElement).disabled).toBe(true);
    // Escape and a click outside are ignored while the request runs.
    expect(dialog_ref.disableClose).toBe(true);
  });
});
