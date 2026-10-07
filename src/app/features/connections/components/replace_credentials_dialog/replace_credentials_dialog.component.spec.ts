import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CONNECTED_CONNECTION } from '../../mocks/connection_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IConnectionView } from '../../models/connection_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { ReplaceCredentialsDialogComponent } from './replace_credentials_dialog.component';

const SECRET = 'rotated-secret-value-456';

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

function render(replace_credentials: () => Observable<IConnectionView>) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { replace_credentials: vi.fn(replace_credentials) };
  TestBed.configureTestingModule({
    imports: [ReplaceCredentialsDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: MAT_DIALOG_DATA, useValue: CONNECTED_CONNECTION },
      { provide: ConnectionsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(ReplaceCredentialsDialogComponent);
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
  /** Opens the secret field for editing, types the secret and presses the shared form's Save. */
  const save_secret = async (secret = SECRET) => {
    by_testid('secret-entry-form-replace-client_secret')?.click();
    fixture.detectChanges();
    type('secret-entry-form-input-client_secret', secret);
    by_testid('secret-entry-form-save-client_secret')?.click();
    fixture.detectChanges();
    await settle();
  };
  return { fixture, element, api, dialog_ref, by_testid, type, save_secret, settle };
}

describe('ReplaceCredentialsDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('names the connection and shows the secret as configured, with no value to see', () => {
    const { element, by_testid } = render(() => of(CONNECTED_CONNECTION));

    expect(element.textContent).toContain('Replace credentials');
    expect(element.querySelector('.replace-credentials__intro')?.textContent).toContain(
      'credentials for Metro Youth Soccer Assignor.',
    );
    expect(element.querySelector('hch-secret-entry-form')).not.toBeNull();
    expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Configured');
    expect(by_testid('secret-entry-form-input-client_secret')).toBeNull();
  });

  it('opens a masked, write-only secret field when replacing', () => {
    const { by_testid, fixture } = render(() => of(CONNECTED_CONNECTION));

    by_testid('secret-entry-form-replace-client_secret')?.click();
    fixture.detectChanges();

    const input = by_testid('secret-entry-form-input-client_secret') as HTMLInputElement;
    expect(input.type).toBe('password');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('sends only the new secret when the client ID is left blank, then closes', async () => {
    const { api, dialog_ref, save_secret } = render(() => of(CONNECTED_CONNECTION));

    await save_secret();

    expect(api.replace_credentials).toHaveBeenCalledWith('conn-1', { client_secret: SECRET });
    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
  });

  it('sends the new client ID together with the secret', async () => {
    const { api, dialog_ref, save_secret, type } = render(() => of(CONNECTED_CONNECTION));

    type('replace-credentials-client-id', '  new-client-id ');
    await save_secret();

    expect(api.replace_credentials).toHaveBeenCalledWith('conn-1', {
      client_secret: SECRET,
      client_id: 'new-client-id',
    });
    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
  });

  it('does not send a whitespace-only client ID', async () => {
    const { api, element, dialog_ref, save_secret, type } = render(() => of(CONNECTED_CONNECTION));

    type('replace-credentials-client-id', '   ');
    await save_secret();

    expect(api.replace_credentials).not.toHaveBeenCalled();
    expect(dialog_ref.close).not.toHaveBeenCalled();
    expect(element.querySelector('mat-error')?.textContent).toContain(
      'Leave the client ID blank to keep the current one.',
    );
  });

  it('shows the shared form as saving and blocks Cancel while the request is in flight', async () => {
    const pending = new Subject<IConnectionView>();
    const { by_testid, dialog_ref, element, fixture, save_secret } = render(() => pending);

    await save_secret();

    expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Saving');
    expect((by_testid('replace-credentials-cancel') as HTMLButtonElement).disabled).toBe(true);

    pending.next(CONNECTED_CONNECTION);
    pending.complete();
    await fixture.whenStable();

    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
  });

  it('shows "did not accept" for a rejected secret, stays open and never echoes the secret', async () => {
    const { by_testid, dialog_ref, element, save_secret } = render(() =>
      throwError(() => api_failure(422, 'CREDENTIALS_REJECTED')),
    );

    await save_secret();

    expect(by_testid('replace-credentials-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('replace-credentials-error')?.textContent).toContain(
      'The provider did not accept these credentials',
    );
    expect(dialog_ref.close).not.toHaveBeenCalled();
    expect(element.textContent).not.toContain(SECRET);
    expect(element.innerHTML).not.toContain(SECRET);
    expect(element.querySelector('hch-secret-entry-form')?.textContent).toContain('Configured');
  });

  it('explains an account mismatch', async () => {
    const { by_testid, save_secret } = render(() =>
      throwError(() => api_failure(409, 'ACCOUNT_MISMATCH')),
    );

    await save_secret();

    expect(by_testid('replace-credentials-error')?.textContent).toContain(
      'These credentials belong to a different account.',
    );
  });

  it('asks to try again when the provider is unavailable', async () => {
    const { by_testid, save_secret } = render(() =>
      throwError(() => api_failure(502, 'PROVIDER_UNAVAILABLE')),
    );

    await save_secret();

    expect(by_testid('replace-credentials-error')?.textContent).toContain('Try again shortly');
  });

  it('puts a client ID violation under the client ID field and clears it when edited', async () => {
    const { element, by_testid, fixture, save_secret, type } = render(() =>
      throwError(() =>
        api_failure(400, 'VALIDATION_ERROR', [
          { path: 'client_id', message: 'Required because no client id is stored' },
        ]),
      ),
    );

    type('replace-credentials-client-id', 'x');
    await save_secret();

    expect(element.querySelector('mat-error')?.textContent).toContain(
      'Required because no client id is stored',
    );

    type('replace-credentials-client-id', 'xy');
    fixture.detectChanges();
    expect(by_testid('replace-credentials-client-id')).not.toBeNull();
    expect(element.querySelector('mat-error')).toBeNull();
  });

  it('logs the real error without the secret', async () => {
    const { save_secret } = render(() =>
      throwError(() => api_failure(422, 'CREDENTIALS_REJECTED')),
    );

    await save_secret();

    expect(logged).toHaveBeenCalledWith('Could not replace the credentials', expect.anything());
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
  });

  it('closes without calling the API when cancelled', () => {
    const { api, by_testid, dialog_ref } = render(() => of(CONNECTED_CONNECTION));

    by_testid('replace-credentials-cancel')?.click();

    expect(dialog_ref.close).toHaveBeenCalled();
    expect(api.replace_credentials).not.toHaveBeenCalled();
  });
});
