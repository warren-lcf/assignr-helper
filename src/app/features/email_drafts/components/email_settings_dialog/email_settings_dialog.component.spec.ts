import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { EmailSettingsChange } from '../../enums/email_settings_change.enum';
import {
  CONFIGURED_SETTINGS,
  FAKE_API_KEY,
  UNCONFIGURED_SETTINGS,
} from '../../mocks/email_settings.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IEmailSettings } from '../../models/email_settings.model';
import { ISaveEmailSettingsRequest } from '../../models/save_email_settings_request.model';
import { EmailSettingsApiService } from '../../services/email_settings_api.service';
import { EmailSettingsDialogComponent } from './email_settings_dialog.component';

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

interface IRenderOptions {
  settings?: IEmailSettings;
  save?: (request: ISaveEmailSettingsRequest) => Observable<IEmailSettings>;
  remove?: () => Observable<void>;
  confirm_remove?: boolean;
}

function render(options: IRenderOptions = {}) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = {
    save_settings: vi.fn(options.save ?? (() => of(CONFIGURED_SETTINGS))),
    remove_settings: vi.fn(options.remove ?? (() => of(undefined))),
  };
  const confirmation = {
    open: vi.fn(() => ({ afterClosed: () => of(options.confirm_remove ?? true) })),
  };
  TestBed.configureTestingModule({
    imports: [EmailSettingsDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: MAT_DIALOG_DATA, useValue: options.settings ?? CONFIGURED_SETTINGS },
      { provide: EmailSettingsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  TestBed.overrideComponent(EmailSettingsDialogComponent, {
    add: { providers: [{ provide: MatDialog, useValue: confirmation }] },
  });
  const fixture = TestBed.createComponent(EmailSettingsDialogComponent);
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
  /** Opens the key field for editing (when a key is stored), types it and presses the shared form's Save. */
  const save_key = async (key = FAKE_API_KEY) => {
    by_testid('secret-entry-form-replace-api_key')?.click();
    fixture.detectChanges();
    type('secret-entry-form-input-api_key', key);
    by_testid('secret-entry-form-save-api_key')?.click();
    fixture.detectChanges();
    await settle();
  };
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    dialog_ref,
    confirmation,
    by_testid,
    settle,
    type,
    save_key,
  };
}

describe('EmailSettingsDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('what it shows', () => {
    it('fills the form from the stored settings', () => {
      const { by_testid } = render();

      expect((by_testid('settings-from-email') as HTMLInputElement).value).toBe(
        'games@example.test',
      );
      expect((by_testid('settings-from-name') as HTMLInputElement).value).toBe('Metro Referees');
      expect((by_testid('settings-reply-to') as HTMLInputElement).value).toBe('help@example.test');
      expect((by_testid('settings-postal-address') as HTMLTextAreaElement).value).toBe(
        '1 Main St, Springfield',
      );
    });

    it('explains why the postal address is asked for', () => {
      const { element } = render();

      expect(element.textContent).toContain('Recipients should be able to see who sent the email');
    });

    it('shows the key as configured, with no value to see', () => {
      const { by_testid, element } = render();

      expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Configured');
      expect(by_testid('secret-entry-form-input-api_key')).toBeNull();
      expect(element.querySelector('input[type="password"]')).toBeNull();
    });

    it('offers Save settings and Remove only once sending is set up', () => {
      const configured = render();
      expect(configured.by_testid('settings-save')).not.toBeNull();
      expect(configured.by_testid('settings-remove')).not.toBeNull();
      expect(configured.by_testid('settings-setup-help')).toBeNull();
      TestBed.resetTestingModule();

      const fresh = render({ settings: UNCONFIGURED_SETTINGS });
      expect(fresh.by_testid('settings-save')).toBeNull();
      expect(fresh.by_testid('settings-remove')).toBeNull();
      expect(fresh.by_testid('settings-setup-help')?.textContent).toContain('API key');
      expect(fresh.by_testid('secret-entry-form-input-api_key')).not.toBeNull();
    });

    it('keeps the shared secret form beside the details form, never inside it', () => {
      const { element } = render();

      const secret_form = element.querySelector('hch-secret-entry-form');
      expect(secret_form?.closest('form#email-settings-form')).toBeNull();
    });

    it('opens a masked, write-only key field when replacing', () => {
      const { by_testid, fixture } = render();

      by_testid('secret-entry-form-replace-api_key')?.click();
      fixture.detectChanges();

      const input = by_testid('secret-entry-form-input-api_key') as HTMLInputElement;
      expect(input.type).toBe('password');
      expect(input.getAttribute('autocomplete')).toBe('off');
    });
  });

  describe('saving the details', () => {
    it('sends the details without the key, and closes', async () => {
      const { api, by_testid, dialog_ref, fixture, settle, type } = render();

      type('settings-from-name', '  Office  ');
      type('settings-reply-to', '');
      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();

      expect(api.save_settings).toHaveBeenCalledWith({
        from_email: 'games@example.test',
        from_name: 'Office',
        reply_to: null,
        postal_address: '1 Main St, Springfield',
      });
      expect('api_key' in api.save_settings.mock.calls[0][0]).toBe(false);
      expect(dialog_ref.close).toHaveBeenCalledWith(EmailSettingsChange.SAVED);
    });

    it('sends nothing when the sender address is blank or not an address', async () => {
      const { api, by_testid, element, fixture, settle, type } = render();

      type('settings-from-email', 'nope');
      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();

      expect(api.save_settings).not.toHaveBeenCalled();
      expect(element.querySelector('mat-error')?.textContent).toContain(
        'Enter a valid email address.',
      );

      type('settings-from-email', '');
      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();
      expect(element.querySelector('mat-error')?.textContent).toContain(
        'Enter the sender address.',
      );
    });

    it('sends nothing when the reply-to is not an address', async () => {
      const { api, by_testid, element, fixture, settle, type } = render();

      type('settings-reply-to', 'nope');
      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();

      expect(api.save_settings).not.toHaveBeenCalled();
      expect(element.querySelector('mat-error')?.textContent).toContain(
        'Enter a valid email address.',
      );
    });

    it('puts a server complaint under its field, and clears it when the field is edited', async () => {
      const { by_testid, element, fixture, settle, type } = render({
        save: () =>
          throwError(() =>
            api_failure(400, 'VALIDATION_ERROR', [
              { path: 'from_email', message: 'Not a verified sender' },
            ]),
          ),
      });

      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();
      expect(element.querySelector('mat-error')?.textContent).toContain('Not a verified sender');

      type('settings-from-email', 'other@example.test');
      expect(element.querySelector('mat-error')).toBeNull();
    });

    it('shows a translated message for any other failure and stays open', async () => {
      const { by_testid, dialog_ref, fixture, settle } = render({
        save: () => throwError(() => api_failure(500, 'INTERNAL')),
      });

      by_testid('settings-save')?.click();
      fixture.detectChanges();
      await settle();

      expect(by_testid('settings-form-error')?.getAttribute('role')).toBe('alert');
      expect(by_testid('settings-form-error')?.textContent).toContain(
        'Something went wrong. Try again.',
      );
      expect(by_testid('settings-form-error')?.textContent).not.toContain('server text');
      expect(dialog_ref.close).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith('Could not save the sender settings', expect.anything());
    });
  });

  describe('saving the key', () => {
    it('sends the key together with the details, then closes', async () => {
      const { api, dialog_ref, save_key } = render();

      await save_key();

      expect(api.save_settings).toHaveBeenCalledWith({
        from_email: 'games@example.test',
        from_name: 'Metro Referees',
        reply_to: 'help@example.test',
        postal_address: '1 Main St, Springfield',
        api_key: FAKE_API_KEY,
      });
      expect(dialog_ref.close).toHaveBeenCalledWith(EmailSettingsChange.SAVED);
    });

    it('sets sending up for the first time with the key and the details', async () => {
      const { api, by_testid, fixture, type } = render({ settings: UNCONFIGURED_SETTINGS });

      type('settings-from-email', 'games@example.test');
      type('secret-entry-form-input-api_key', FAKE_API_KEY);
      by_testid('secret-entry-form-save-api_key')?.click();
      fixture.detectChanges();
      await fixture.whenStable();
      await new Promise((resolve) => setTimeout(resolve));

      expect(api.save_settings).toHaveBeenCalledWith({
        from_email: 'games@example.test',
        from_name: null,
        reply_to: null,
        postal_address: null,
        api_key: FAKE_API_KEY,
      });
    });

    it('does not save the key while the details are invalid', async () => {
      const { api, element, save_key, type } = render();

      type('settings-from-email', 'nope');
      await save_key();

      expect(api.save_settings).not.toHaveBeenCalled();
      expect(element.querySelector('mat-error')?.textContent).toContain(
        'Enter a valid email address.',
      );
    });

    it('shows a rejected key in the dialog, returns the field to configured and never echoes the key', async () => {
      const { by_testid, dialog_ref, element, save_key } = render({
        save: () =>
          throwError(() =>
            api_failure(400, 'VALIDATION_ERROR', [
              { path: 'api_key', message: 'SendGrid did not accept this key' },
            ]),
          ),
      });

      await save_key();

      expect(by_testid('settings-form-error')?.textContent).toContain(
        'SendGrid did not accept this key',
      );
      expect(dialog_ref.close).not.toHaveBeenCalled();
      expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Configured');
      expect(element.textContent).not.toContain(FAKE_API_KEY);
      expect(element.innerHTML).not.toContain(FAKE_API_KEY);
    });

    it('logs the real error without the key', async () => {
      const { save_key } = render({ save: () => throwError(() => api_failure(500, 'INTERNAL')) });

      await save_key();

      expect(logged).toHaveBeenCalledWith('Could not save the sender settings', expect.anything());
      expect(JSON.stringify(logged.mock.calls)).not.toContain(FAKE_API_KEY);
    });

    it('shows the shared form as saving while the request is in flight, and blocks the other buttons', async () => {
      const pending = new Subject<IEmailSettings>();
      const { by_testid, dialog_ref, element, save_key } = render({ save: () => pending });

      await save_key();

      expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Saving');
      expect((by_testid('settings-cancel') as HTMLButtonElement).disabled).toBe(true);
      expect((by_testid('settings-remove') as HTMLButtonElement).disabled).toBe(true);
      // Escape and a click outside are ignored while the request runs.
      expect(dialog_ref.disableClose).toBe(true);
    });
  });

  describe('removing the settings', () => {
    it('asks first, naming the sender, and removes only when confirmed', async () => {
      const { api, by_testid, confirmation, dialog_ref, settle } = render();

      by_testid('settings-remove')?.click();
      await settle();

      expect(confirmation.open).toHaveBeenCalledTimes(1);
      const call = confirmation.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string; is_destructive: boolean } },
      ];
      expect(call[1].data.is_destructive).toBe(true);
      expect(call[1].data.message).toContain('games@example.test');
      expect(api.remove_settings).toHaveBeenCalledTimes(1);
      expect(dialog_ref.close).toHaveBeenCalledWith(EmailSettingsChange.REMOVED);
    });

    it('removes nothing when the sender declines', async () => {
      const { api, by_testid, dialog_ref, settle } = render({ confirm_remove: false });

      by_testid('settings-remove')?.click();
      await settle();

      expect(api.remove_settings).not.toHaveBeenCalled();
      expect(dialog_ref.close).not.toHaveBeenCalled();
    });

    it('shows a message and stays open when the removal fails', async () => {
      const { by_testid, dialog_ref, settle } = render({
        remove: () => throwError(() => api_failure(500, 'INTERNAL')),
      });

      by_testid('settings-remove')?.click();
      await settle();

      expect(by_testid('settings-form-error')?.textContent).toContain(
        'Something went wrong. Try again.',
      );
      expect(dialog_ref.close).not.toHaveBeenCalled();
      expect(logged).toHaveBeenCalledWith(
        'Could not remove the sender settings',
        expect.anything(),
      );
    });

    it('names the account generically when no sender address is stored', async () => {
      const { by_testid, confirmation, settle } = render({
        settings: { ...CONFIGURED_SETTINGS, from_email: null },
      });

      by_testid('settings-remove')?.click();
      await settle();

      const call = confirmation.open.mock.calls[0] as unknown as [
        unknown,
        { data: { message: string } },
      ];
      expect(call[1].data.message).toContain('this account');
    });
  });

  it('closes with nothing on Cancel', () => {
    const { by_testid, dialog_ref, api } = render();

    by_testid('settings-cancel')?.click();

    expect(dialog_ref.close).toHaveBeenCalled();
    expect(api.save_settings).not.toHaveBeenCalled();
  });
});
