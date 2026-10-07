import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent, ToastService } from '@hch-shared-libraries/ui-kit/core';
import { Observable, Subject, of, throwError } from 'rxjs';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { ConnectionTestFailure } from '../../enums/connection_test_failure.enum';
import {
  CONNECTED_CONNECTION,
  CONNECTION_FIXTURES,
  DISCONNECTED_CONNECTION,
  NEEDS_ATTENTION_CONNECTION,
} from '../../mocks/connection_view.mock';
import {
  OWNER_PERMISSIONS,
  REFEREE_PERMISSIONS,
  make_session_service_double,
} from '../../mocks/session_service.mock';
import { FAILED_RUN, SUCCEEDED_RUN } from '../../mocks/sync_run_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IConnectionTestResult } from '../../models/connection_test_result.model';
import { IConnectionView } from '../../models/connection_view.model';
import { ISyncRunView } from '../../models/sync_run_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { AddConnectionDialogComponent } from '../add_connection_dialog/add_connection_dialog.component';
import { ReplaceCredentialsDialogComponent } from '../replace_credentials_dialog/replace_credentials_dialog.component';
import { ConnectionsPageComponent } from './connections_page.component';

interface IRenderOptions {
  permissions?: readonly (typeof OWNER_PERMISSIONS)[number][];
  connections?: () => Observable<IConnectionView[]>;
  session_loading?: boolean;
  dialog_results?: Map<unknown, unknown>;
}

function render(options: IRenderOptions = {}) {
  const api = {
    list_connections: vi.fn(options.connections ?? (() => of([...CONNECTION_FIXTURES]))),
    list_sync_runs: vi.fn(() => of([])),
    sync_connection: vi.fn((): Observable<ISyncRunView[]> => of([SUCCEEDED_RUN])),
    test_connection: vi.fn((): Observable<IConnectionTestResult> =>
      of({ ok: true, failure: null }),
    ),
    disconnect_connection: vi.fn(() => of(DISCONNECTED_CONNECTION)),
  };
  const toast = { show_success: vi.fn(), show_error: vi.fn(), show_info: vi.fn() };
  const dialog_results = options.dialog_results ?? new Map<unknown, unknown>();
  const dialog = {
    open: vi.fn((component: unknown) => ({ afterClosed: () => of(dialog_results.get(component)) })),
  };
  TestBed.configureTestingModule({
    imports: [ConnectionsPageComponent],
    providers: [
      { provide: ConnectionsApiService, useValue: api },
      {
        provide: SessionService,
        useValue: make_session_service_double(
          options.permissions ?? OWNER_PERMISSIONS,
          options.session_loading,
        ),
      },
      { provide: ToastService, useValue: toast },
      { provide: MatDialog, useValue: dialog },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(ConnectionsPageComponent);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  const by_testid = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  return {
    fixture,
    component: fixture.componentInstance,
    element,
    api,
    toast,
    dialog,
    settle,
    by_testid,
  };
}

describe('ConnectionsPageComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  describe('states', () => {
    it('shows skeleton cards while the connections load', async () => {
      const pending = new Subject<IConnectionView[]>();
      const { element, by_testid } = render({ connections: () => pending });

      expect(by_testid('connections-loading')).not.toBeNull();
      expect(element.querySelectorAll('hch-skeleton-card')).toHaveLength(3);
      expect(element.querySelector('app-connection-card')).toBeNull();
    });

    it('shows skeletons while the session loads, so read-only does not flash', async () => {
      const { by_testid, settle } = render({ session_loading: true });
      await settle();

      expect(by_testid('connections-loading')).not.toBeNull();
    });

    it('lists a card per connection with the page title, and the sync history', async () => {
      const { element, settle } = render();
      await settle();

      expect(element.querySelector('hch-page-container')).not.toBeNull();
      expect(element.textContent).toContain('Connections');
      expect(element.querySelectorAll('app-connection-card')).toHaveLength(3);
      expect(element.textContent).toContain('Metro Youth Soccer Assignor');
      expect(element.textContent).toContain('County Rec League');
      expect(element.textContent).toContain('Lakeside Futsal Assignor');
      for (const status of ['Connected', 'Needs attention', 'Disconnected']) {
        expect(element.textContent).toContain(status);
      }
      expect(element.querySelector('app-sync-history')).not.toBeNull();
    });

    it('invites a manager to connect their first assignor when there are none', async () => {
      const { element, by_testid, settle, dialog } = render({ connections: () => of([]) });
      await settle();

      expect(element.textContent).toContain('Connect your first assignor');
      expect(element.querySelector('app-sync-history')).toBeNull();
      by_testid('connections-empty-add')?.click();
      expect(dialog.open).toHaveBeenCalledWith(AddConnectionDialogComponent, expect.anything());
    });

    it('shows the empty state without an action to someone who cannot manage', async () => {
      const { element, by_testid, settle } = render({
        connections: () => of([]),
        permissions: REFEREE_PERMISSIONS,
      });
      await settle();

      expect(element.textContent).toContain('Connect your first assignor');
      expect(element.textContent).toContain('Ask a tenant owner to add one.');
      expect(by_testid('connections-empty-add')).toBeNull();
      expect(by_testid('connections-add')).toBeNull();
    });

    it('shows an error with a retry and logs the real error when loading fails', async () => {
      let attempts = 0;
      const { api, element, by_testid, settle } = render({
        connections: () => {
          attempts += 1;
          return attempts === 1
            ? throwError(() => new HttpErrorResponse({ status: 500 }))
            : of([CONNECTED_CONNECTION]);
        },
      });
      await settle();

      expect(element.textContent).toContain('Connections could not be loaded');
      expect(logged).toHaveBeenCalledWith('Could not load the connections', expect.anything());

      by_testid('connections-retry')?.click();
      await settle();

      expect(api.list_connections).toHaveBeenCalledTimes(2);
      expect(element.textContent).toContain('Metro Youth Soccer Assignor');
    });

    it('asks a platform administrator without a tenant to choose one', async () => {
      const { element, settle } = render({
        connections: () =>
          throwError(
            () =>
              new HttpErrorResponse({
                status: 400,
                error: { code: 'TENANT_REQUIRED', message: 'x', violations: [] },
              }),
          ),
      });
      await settle();

      expect(element.textContent).toContain('Choose a tenant first');
    });
  });

  describe('permissions', () => {
    it('shows every action to a tenant owner', async () => {
      const { by_testid, settle } = render();
      await settle();

      expect(by_testid('connections-add')).not.toBeNull();
      expect(by_testid('connection-sync-conn-1')).not.toBeNull();
      expect(by_testid('connection-test-conn-1')).not.toBeNull();
      expect(by_testid('connection-replace-conn-1')).not.toBeNull();
      expect(by_testid('connection-disconnect-conn-1')).not.toBeNull();
    });

    it('is read-only without connections.manage and sync.run: no action buttons at all', async () => {
      const { element, by_testid, settle } = render({ permissions: REFEREE_PERMISSIONS });
      await settle();

      expect(element.querySelectorAll('app-connection-card')).toHaveLength(3);
      expect(by_testid('connections-add')).toBeNull();
      expect(element.querySelectorAll('app-connection-card button')).toHaveLength(0);
    });

    it('offers only Sync now to a user with sync.run but not connections.manage', async () => {
      const { element, by_testid, settle } = render({
        permissions: [...REFEREE_PERMISSIONS, 'sync.run' as (typeof OWNER_PERMISSIONS)[number]],
      });
      await settle();

      expect(by_testid('connection-sync-conn-1')).not.toBeNull();
      expect(by_testid('connection-test-conn-1')).toBeNull();
      expect(by_testid('connections-add')).toBeNull();
      expect(element.querySelectorAll('app-connection-card button')).toHaveLength(1);
    });
  });

  describe('add connection', () => {
    it('opens the add dialog from the header action', async () => {
      const { by_testid, dialog, settle } = render();
      await settle();

      by_testid('connections-add')?.click();

      expect(dialog.open).toHaveBeenCalledWith(AddConnectionDialogComponent, expect.anything());
    });

    it('announces the new connection and refreshes the list', async () => {
      const results = new Map<unknown, unknown>([
        [AddConnectionDialogComponent, CONNECTED_CONNECTION],
      ]);
      const { api, component, settle, toast } = render({ dialog_results: results });
      await settle();

      await component.on_add_requested();
      await settle();

      expect(toast.show_success).toHaveBeenCalledWith('Connected Metro Youth Soccer Assignor.');
      expect(api.list_connections).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the dialog is dismissed', async () => {
      const { api, component, settle, toast } = render();
      await settle();

      await component.on_add_requested();
      await settle();

      expect(toast.show_success).not.toHaveBeenCalled();
      expect(api.list_connections).toHaveBeenCalledTimes(1);
    });
  });

  describe('sync now', () => {
    it('syncs, toasts success and reloads the list and the history', async () => {
      const { api, component, settle, toast } = render();
      await settle();

      await component.on_sync_requested(CONNECTED_CONNECTION);
      await settle();

      expect(api.sync_connection).toHaveBeenCalledWith('conn-1');
      expect(toast.show_success).toHaveBeenCalledWith('Synced Metro Youth Soccer Assignor.');
      expect(api.list_connections).toHaveBeenCalledTimes(2);
      expect(api.list_sync_runs).toHaveBeenCalledTimes(2);
    });

    it('toasts a partial result when some steps failed and some succeeded', async () => {
      const { api, component, settle, toast } = render();
      api.sync_connection.mockReturnValue(of([SUCCEEDED_RUN, FAILED_RUN]));
      await settle();

      await component.on_sync_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_info).toHaveBeenCalledWith(
        'Synced Metro Youth Soccer Assignor with problems: 1 of 2 steps failed.',
      );
      expect(toast.show_success).not.toHaveBeenCalled();
    });

    it('toasts an error when every step failed', async () => {
      const { api, component, settle, toast } = render();
      api.sync_connection.mockReturnValue(of([FAILED_RUN]));
      await settle();

      await component.on_sync_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Sync of Metro Youth Soccer Assignor failed. Check the sync history for details.',
      );
    });

    it('says the connection needs new credentials when it cannot be synced', async () => {
      const { api, component, settle, toast } = render();
      api.sync_connection.mockReturnValue(
        throwError(
          () =>
            new HttpErrorResponse({
              status: 409,
              error: { code: 'CONNECTION_NOT_SYNCABLE', message: 'x', violations: [] },
            }),
        ),
      );
      await settle();

      await component.on_sync_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Metro Youth Soccer Assignor needs new credentials before it can sync.',
      );
      expect(api.list_connections).toHaveBeenCalledTimes(2);
    });

    it('toasts a generic error for any other failure and logs the real one', async () => {
      const { api, component, settle, toast } = render();
      api.sync_connection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      await settle();

      await component.on_sync_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Could not sync Metro Youth Soccer Assignor. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Sync failed', expect.anything());
    });

    it('marks the card busy while syncing and ignores a second action', async () => {
      const pending = new Subject<ISyncRunView[]>();
      const { api, by_testid, component, fixture, settle } = render();
      api.sync_connection.mockReturnValue(pending);
      await settle();

      const first = component.on_sync_requested(CONNECTED_CONNECTION);
      fixture.detectChanges();
      await component.on_test_requested(CONNECTED_CONNECTION);
      await settle();

      expect(component.busy_connection_id()).toBe('conn-1');
      expect((by_testid('connection-sync-conn-1') as HTMLButtonElement).disabled).toBe(true);
      expect(
        by_testid('connection-sync-conn-1')?.querySelector('mat-progress-spinner'),
      ).not.toBeNull();
      expect(api.test_connection).not.toHaveBeenCalled();

      pending.next([SUCCEEDED_RUN]);
      pending.complete();
      await first;

      expect(component.busy_connection_id()).toBeNull();
    });
  });

  describe('test connection', () => {
    it('toasts success when the credentials work', async () => {
      const { api, component, settle, toast } = render();
      await settle();

      await component.on_test_requested(CONNECTED_CONNECTION);
      await settle();

      expect(api.test_connection).toHaveBeenCalledWith('conn-1');
      expect(toast.show_success).toHaveBeenCalledWith(
        'The connection to Metro Youth Soccer Assignor works.',
      );
    });

    it.each([
      [
        ConnectionTestFailure.NO_CREDENTIALS,
        'No credentials are stored for Metro Youth Soccer Assignor. Replace the credentials to reconnect.',
      ],
      [
        ConnectionTestFailure.REJECTED,
        'Assignr did not accept the stored credentials for Metro Youth Soccer Assignor. Replace the credentials.',
      ],
      [ConnectionTestFailure.UNREACHABLE, 'Assignr could not be reached. Try again shortly.'],
    ])('toasts the reason for a %s failure', async (failure, message) => {
      const { api, component, settle, toast } = render();
      api.test_connection.mockReturnValue(of({ ok: false, failure }));
      await settle();

      await component.on_test_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(message);
    });

    it('toasts a generic error when the test call itself fails', async () => {
      const { api, component, settle, toast } = render();
      api.test_connection.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
      await settle();

      await component.on_test_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Could not test Metro Youth Soccer Assignor. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Connection test failed', expect.anything());
    });
  });

  describe('replace credentials', () => {
    it('opens the dialog for the connection, announces success and refreshes', async () => {
      const results = new Map<unknown, unknown>([
        [ReplaceCredentialsDialogComponent, NEEDS_ATTENTION_CONNECTION],
      ]);
      const { api, component, dialog, settle, toast } = render({ dialog_results: results });
      await settle();

      await component.on_replace_requested(NEEDS_ATTENTION_CONNECTION);
      await settle();

      expect(dialog.open).toHaveBeenCalledWith(
        ReplaceCredentialsDialogComponent,
        expect.objectContaining({ data: NEEDS_ATTENTION_CONNECTION }),
      );
      expect(toast.show_success).toHaveBeenCalledWith(
        'Replaced the credentials for County Rec League.',
      );
      expect(api.list_connections).toHaveBeenCalledTimes(2);
    });

    it('does nothing when the dialog is dismissed', async () => {
      const { api, component, settle, toast } = render();
      await settle();

      await component.on_replace_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_success).not.toHaveBeenCalled();
      expect(api.list_connections).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('asks first, naming the connection, in a destructive confirmation', async () => {
      const { api, component, dialog, settle } = render();
      await settle();

      await component.on_disconnect_requested(CONNECTED_CONNECTION);
      await settle();

      const [dialog_component, config] = dialog.open.mock.calls[0] as unknown as [
        unknown,
        { data: Record<string, unknown> },
      ];
      expect(dialog_component).toBe(ConfirmationDialogComponent);
      expect(config.data['is_destructive']).toBe(true);
      expect(config.data['title']).toBe('Disconnect Metro Youth Soccer Assignor?');
      expect(config.data['message']).toContain('"Metro Youth Soccer Assignor"');
      expect(api.disconnect_connection).not.toHaveBeenCalled();
    });

    it('disconnects, toasts and refreshes once confirmed', async () => {
      const results = new Map<unknown, unknown>([[ConfirmationDialogComponent, true]]);
      const { api, component, settle, toast } = render({ dialog_results: results });
      await settle();

      await component.on_disconnect_requested(CONNECTED_CONNECTION);
      await settle();

      expect(api.disconnect_connection).toHaveBeenCalledWith('conn-1');
      expect(toast.show_success).toHaveBeenCalledWith('Disconnected Metro Youth Soccer Assignor.');
      expect(api.list_connections).toHaveBeenCalledTimes(2);
    });

    it('reports a failed disconnect and still refreshes', async () => {
      const results = new Map<unknown, unknown>([[ConfirmationDialogComponent, true]]);
      const { api, component, settle, toast } = render({ dialog_results: results });
      api.disconnect_connection.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      await settle();

      await component.on_disconnect_requested(CONNECTED_CONNECTION);
      await settle();

      expect(toast.show_error).toHaveBeenCalledWith(
        'Could not disconnect Metro Youth Soccer Assignor. Try again.',
      );
      expect(logged).toHaveBeenCalledWith('Disconnect failed', expect.anything());
      expect(api.list_connections).toHaveBeenCalledTimes(2);
    });
  });

  it('wires the card buttons through to the page actions', async () => {
    const { api, by_testid, settle } = render();
    await settle();

    by_testid('connection-test-conn-1')?.click();
    await settle();

    expect(api.test_connection).toHaveBeenCalledWith('conn-1');
  });
});
