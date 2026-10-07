import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CONNECTED_CONNECTION } from '../../mocks/connection_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IConnectionView } from '../../models/connection_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { AddConnectionDialogComponent } from './add_connection_dialog.component';

const SECRET = 'super-secret-value-123';

function api_failure(status: number, code: string, violations: unknown[] = []): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: { code, message: 'server text', violations } });
}

function render(create_connection: () => Observable<IConnectionView>) {
  const dialog_ref = { close: vi.fn(), disableClose: false };
  const api = { create_connection: vi.fn(create_connection) };
  TestBed.configureTestingModule({
    imports: [AddConnectionDialogComponent],
    providers: [
      { provide: MatDialogRef, useValue: dialog_ref },
      { provide: ConnectionsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(AddConnectionDialogComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const type = (id: string, value: string) => {
    const input = by_testid(id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = async () => {
    by_testid('add-connection-submit')?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const errors = () =>
    Array.from(element.querySelectorAll('mat-error')).map((node) => node.textContent?.trim());
  return { fixture, element, api, dialog_ref, by_testid, type, submit, errors };
}

describe('AddConnectionDialogComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('asks for a provider, a client ID and a client secret', () => {
    const { element, by_testid } = render(() => of(CONNECTED_CONNECTION));

    expect(element.querySelector('h2')?.textContent).toContain('Add connection');
    expect(by_testid('add-connection-provider')).not.toBeNull();
    expect(by_testid('add-connection-client-id')).not.toBeNull();
    expect(by_testid('add-connection-client-secret')).not.toBeNull();
    expect(element.textContent).toContain('Assignr');
  });

  it('keeps the secret write-only: a password input, autocomplete off, no reveal control', () => {
    const { element, by_testid } = render(() => of(CONNECTED_CONNECTION));
    const secret = by_testid('add-connection-client-secret') as HTMLInputElement;

    expect(secret.type).toBe('password');
    expect(secret.getAttribute('autocomplete')).toBe('off');
    expect(element.querySelector('mat-form-field button')).toBeNull();
  });

  it('shows inline required errors and does not call the API when the form is empty', async () => {
    const { api, errors, submit } = render(() => of(CONNECTED_CONNECTION));

    await submit();

    expect(api.create_connection).not.toHaveBeenCalled();
    expect(errors()).toEqual(['Enter the client ID.', 'Enter the client secret.']);
  });

  it('rejects a whitespace-only client ID and secret', async () => {
    const { api, errors, submit, type } = render(() => of(CONNECTED_CONNECTION));

    type('add-connection-client-id', '   ');
    type('add-connection-client-secret', '   ');
    await submit();

    expect(api.create_connection).not.toHaveBeenCalled();
    expect(errors()).toEqual(['Enter the client ID.', 'Enter the client secret.']);
  });

  it('enforces the 256 and 512 character limits', async () => {
    const { api, errors, fixture, submit } = render(() => of(CONNECTED_CONNECTION));

    fixture.componentInstance.model.update((model) => ({
      ...model,
      client_id: 'a'.repeat(257),
      client_secret: 'b'.repeat(513),
    }));
    fixture.detectChanges();
    await submit();

    expect(api.create_connection).not.toHaveBeenCalled();
    expect(errors()).toEqual([
      'The client ID can be at most 256 characters.',
      'The client secret can be at most 512 characters.',
    ]);
  });

  it('sends trimmed credentials, closes with the connection and wipes the secret', async () => {
    const { api, dialog_ref, fixture, submit, type } = render(() => of(CONNECTED_CONNECTION));

    type('add-connection-client-id', '  my-client-id  ');
    type('add-connection-client-secret', `  ${SECRET}  `);
    await submit();

    expect(api.create_connection).toHaveBeenCalledWith({
      provider: 'ASSIGNR',
      client_id: 'my-client-id',
      client_secret: SECRET,
    });
    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
    expect(fixture.componentInstance.model().client_secret).toBe('');
    expect(fixture.componentInstance.model().client_id).toBe('');
  });

  it('shows progress and disables both buttons while the request is in flight', async () => {
    const pending = new Subject<IConnectionView>();
    const { by_testid, dialog_ref, fixture, type } = render(() => pending);

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    by_testid('add-connection-submit')?.click();
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();

    const submit_button = by_testid('add-connection-submit') as HTMLButtonElement;
    expect(submit_button.disabled).toBe(true);
    expect(submit_button.getAttribute('aria-busy')).toBe('true');
    expect(submit_button.querySelector('mat-progress-spinner')).not.toBeNull();
    expect((by_testid('add-connection-cancel') as HTMLButtonElement).disabled).toBe(true);
    expect(dialog_ref.disableClose).toBe(true);

    pending.next(CONNECTED_CONNECTION);
    pending.complete();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
  });

  it('puts "did not accept" under the secret field for a rejected credential and stays open', async () => {
    const { dialog_ref, errors, submit, type } = render(() =>
      throwError(() => api_failure(422, 'CREDENTIALS_REJECTED')),
    );

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();

    expect(errors()).toEqual(['The provider did not accept these credentials']);
    expect(dialog_ref.close).not.toHaveBeenCalled();
  });

  it('explains that the credentials belong to a different account', async () => {
    const { by_testid, submit, type } = render(() =>
      throwError(() => api_failure(409, 'ACCOUNT_MISMATCH')),
    );

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();

    expect(by_testid('add-connection-form-error')?.getAttribute('role')).toBe('alert');
    expect(by_testid('add-connection-form-error')?.textContent).toContain(
      'These credentials belong to a different account.',
    );
  });

  it('asks to try again when the provider is unavailable, and allows retrying', async () => {
    let attempts = 0;
    const { api, by_testid, dialog_ref, submit, type } = render(() => {
      attempts += 1;
      return attempts === 1
        ? throwError(() => api_failure(502, 'PROVIDER_UNAVAILABLE'))
        : of(CONNECTED_CONNECTION);
    });

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();
    expect(by_testid('add-connection-form-error')?.textContent).toContain('Try again shortly');

    await submit();

    expect(api.create_connection).toHaveBeenCalledTimes(2);
    expect(dialog_ref.close).toHaveBeenCalledWith(CONNECTED_CONNECTION);
    expect(by_testid('add-connection-form-error')).toBeNull();
  });

  it('maps 400 violations back to the fields by path', async () => {
    const { errors, submit, type } = render(() =>
      throwError(() =>
        api_failure(400, 'VALIDATION_ERROR', [
          { path: 'client_id', message: 'Client id is not allowed' },
          { path: 'client_secret', message: 'Secret is malformed' },
        ]),
      ),
    );

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();

    expect(errors()).toEqual(['Client id is not allowed', 'Secret is malformed']);
  });

  it('logs the real error without the secret', async () => {
    const { submit, type } = render(() =>
      throwError(() => api_failure(422, 'CREDENTIALS_REJECTED')),
    );

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();

    expect(logged).toHaveBeenCalledWith('Could not add the connection', expect.anything());
    expect(JSON.stringify(logged.mock.calls)).not.toContain(SECRET);
  });

  it('shows a generic message for a network failure', async () => {
    const { by_testid, submit, type } = render(() =>
      throwError(() => new HttpErrorResponse({ status: 0 })),
    );

    type('add-connection-client-id', 'id');
    type('add-connection-client-secret', SECRET);
    await submit();

    expect(by_testid('add-connection-form-error')?.textContent).toContain(
      'Something went wrong. Try again.',
    );
  });
});
