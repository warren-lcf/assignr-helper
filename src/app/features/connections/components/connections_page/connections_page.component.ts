import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import {
  CardHeaderAction,
  CardHeaderActionVariant,
  PageContainerComponent,
} from '@hch-shared-libraries/ui-kit/app';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
  EmptyStateComponent,
  SkeletonCardComponent,
  ToastService,
} from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { PermissionKey } from '../../../../core/services/session/permission_key.enum';
import { SessionService } from '../../../../core/services/session/session.service';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CONNECTION_TEST_FAILURE_MESSAGE } from '../../constants/connection_test_failure_message.constant';
import { ApiErrorCode } from '../../enums/api_error_code.enum';
import { ConnectionAction } from '../../enums/connection_action.enum';
import { SyncOutcome } from '../../enums/sync_outcome.enum';
import { SyncRunStatus } from '../../enums/sync_run_status.enum';
import { IConnectionView } from '../../models/connection_view.model';
import { ISyncRunView } from '../../models/sync_run_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { parse_api_error } from '../../services/parse_api_error';
import { classify_sync_runs } from '../../utils/classify_sync_runs';
import { AddConnectionDialogComponent } from '../add_connection_dialog/add_connection_dialog.component';
import { ConnectionCardComponent } from '../connection_card/connection_card.component';
import { ReplaceCredentialsDialogComponent } from '../replace_credentials_dialog/replace_credentials_dialog.component';
import { SyncHistoryComponent } from '../sync_history/sync_history.component';

/** How many skeleton cards stand in for connections while they load. */
const SKELETON_CARD_COUNT = 3;

/** Dialog sizing: roomy on a desktop, never wider than the screen on a phone. */
const DIALOG_WIDTH = '480px';
const DIALOG_MAX_WIDTH = 'calc(100vw - 32px)';

/**
 * The tenant's Connections page: a card per connection with sync, test,
 * replace-credentials and disconnect actions, an "Add connection" action, and
 * the sync history of a selected connection. Manage actions need
 * `connections.manage` and "Sync now" needs `sync.run`; everyone else sees a
 * read-only view. Handles loading, empty and error states.
 */
@Component({
  selector: 'app-connections-page',
  standalone: true,
  imports: [
    PageContainerComponent,
    EmptyStateComponent,
    SkeletonCardComponent,
    ConnectionCardComponent,
    SyncHistoryComponent,
  ],
  templateUrl: './connections_page.component.html',
  styleUrl: './connections_page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsPageComponent {
  private readonly api = inject(ConnectionsApiService);
  private readonly session = inject(SessionService);
  private readonly dialog = inject(MatDialog);
  private readonly toast = inject(ToastService);
  private readonly translation = inject(AppTranslationService);

  /** The tenant's connections. */
  public readonly connections = rxResource({ stream: () => this.api.list_connections() });
  public readonly connection_list = computed<IConnectionView[]>(() =>
    this.connections.hasValue() ? this.connections.value() : [],
  );

  public readonly can_manage = computed(() =>
    this.session.permissions().has(PermissionKey.CONNECTIONS_MANAGE),
  );
  public readonly can_sync = computed(() => this.session.permissions().has(PermissionKey.SYNC_RUN));

  /** Skeletons show until both the session and the first list have loaded. */
  public readonly is_loading = computed(
    () =>
      this.session.is_loading() || (!this.connections.hasValue() && this.connections.isLoading()),
  );
  public readonly load_failed = computed(
    () => !this.connections.hasValue() && this.connections.error() !== undefined,
  );
  /** True when the failure is a platform administrator who has not picked a tenant. */
  public readonly needs_tenant = computed(
    () =>
      parse_api_error(unwrap_error(this.connections.error()))?.code ===
      ApiErrorCode.TENANT_REQUIRED,
  );

  /** The connection an action is running on, and which action. */
  public readonly busy_connection_id = signal<string | null>(null);
  public readonly busy_action = signal<ConnectionAction | null>(null);
  /** Bumped after a sync so the history reloads. */
  public readonly history_refresh_token = signal(0);

  public readonly skeleton_slots = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);

  /** "Add connection" in the page header; only for those who may manage. */
  public readonly header_actions = computed<CardHeaderAction[]>(() =>
    this.can_manage()
      ? [
          {
            icon: 'add',
            label: this.t('Add connection'),
            on_click: () => void this.on_add_requested(),
            variant: CardHeaderActionVariant.PRIMARY,
            testid: 'connections-add',
          },
        ]
      : [],
  );

  public constructor() {
    effect(() => {
      const error = this.connections.error();
      if (error) console.error('Could not load the connections', error);
    });
  }

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }

  /**
   * Which action is running on a connection, if any.
   * @param connection The connection.
   * @returns The running action, or null.
   */
  public busy_action_for(connection: IConnectionView): ConnectionAction | null {
    return this.busy_connection_id() === connection.connection_id ? this.busy_action() : null;
  }

  /**
   * Loads the connections again, e.g. after a failure.
   * @returns Nothing.
   */
  public reload(): void {
    this.connections.reload();
  }

  /**
   * Opens the add-connection dialog; on success announces it and refreshes the list.
   * @returns Resolves when the dialog has closed.
   */
  public async on_add_requested(): Promise<void> {
    const connection = await firstValueFrom(
      this.dialog
        .open<AddConnectionDialogComponent, void, IConnectionView>(AddConnectionDialogComponent, {
          width: DIALOG_WIDTH,
          maxWidth: DIALOG_MAX_WIDTH,
        })
        .afterClosed(),
    );
    if (!connection) return;
    this.toast.show_success(this.t('Connected {{label}}.', { label: this.label_of(connection) }));
    this.connections.reload();
    this.history_refresh_token.update((token) => token + 1);
  }

  /**
   * Syncs a connection now and reports the outcome in a toast.
   * @param connection The connection to sync.
   * @returns Resolves when the sync and the refresh are done.
   */
  public async on_sync_requested(connection: IConnectionView): Promise<void> {
    await this.run_action(connection, ConnectionAction.SYNC, async () => {
      const label = this.label_of(connection);
      try {
        const runs = await firstValueFrom(this.api.sync_connection(connection.connection_id));
        this.announce_sync(label, runs);
      } catch (error) {
        console.error('Sync failed', error);
        this.toast.show_error(
          parse_api_error(error)?.code === ApiErrorCode.CONNECTION_NOT_SYNCABLE
            ? this.t('{{label}} needs new credentials before it can sync.', { label })
            : this.t('Could not sync {{label}}. Try again.', { label }),
        );
      } finally {
        this.connections.reload();
        this.history_refresh_token.update((token) => token + 1);
      }
    });
  }

  /**
   * Tests a connection's stored credentials and reports the result in a toast.
   * @param connection The connection to test.
   * @returns Resolves when the test is done.
   */
  public async on_test_requested(connection: IConnectionView): Promise<void> {
    await this.run_action(connection, ConnectionAction.TEST, async () => {
      const label = this.label_of(connection);
      try {
        const result = await firstValueFrom(this.api.test_connection(connection.connection_id));
        if (result.ok) {
          this.toast.show_success(this.t('The connection to {{label}} works.', { label }));
        } else {
          const message =
            result.failure === null
              ? 'Could not test {{label}}. Try again.'
              : CONNECTION_TEST_FAILURE_MESSAGE[result.failure];
          this.toast.show_error(this.t(message, { label }));
        }
      } catch (error) {
        console.error('Connection test failed', error);
        this.toast.show_error(this.t('Could not test {{label}}. Try again.', { label }));
      }
    });
  }

  /**
   * Opens the replace-credentials dialog; on success announces it and refreshes.
   * @param connection The connection whose credentials are replaced.
   * @returns Resolves when the dialog has closed.
   */
  public async on_replace_requested(connection: IConnectionView): Promise<void> {
    await this.run_action(connection, ConnectionAction.REPLACE, async () => {
      const replaced = await firstValueFrom(
        this.dialog
          .open<ReplaceCredentialsDialogComponent, IConnectionView, IConnectionView>(
            ReplaceCredentialsDialogComponent,
            { data: connection, width: DIALOG_WIDTH, maxWidth: DIALOG_MAX_WIDTH },
          )
          .afterClosed(),
      );
      if (!replaced) return;
      this.toast.show_success(
        this.t('Replaced the credentials for {{label}}.', { label: this.label_of(replaced) }),
      );
      this.connections.reload();
    });
  }

  /**
   * Asks for confirmation, then disconnects. The dialog names the connection.
   * @param connection The connection to disconnect.
   * @returns Resolves when the dialog has closed and any disconnect is done.
   */
  public async on_disconnect_requested(connection: IConnectionView): Promise<void> {
    const label = this.label_of(connection);
    const data: ConfirmationDialogData = {
      title: this.t('Disconnect {{label}}?', { label }),
      message: this.t(
        'Disconnect "{{label}}"? Syncing stops and its stored credentials are deleted. You can reconnect later by replacing the credentials.',
        { label },
      ),
      confirm_button_label: this.t('Disconnect'),
      cancel_button_label: this.t('Cancel'),
      is_destructive: true,
    };
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmationDialogComponent, ConfirmationDialogData, boolean>(
          ConfirmationDialogComponent,
          { data },
        )
        .afterClosed(),
    );
    if (!confirmed) return;

    await this.run_action(connection, ConnectionAction.DISCONNECT, async () => {
      try {
        await firstValueFrom(this.api.disconnect_connection(connection.connection_id));
        this.toast.show_success(this.t('Disconnected {{label}}.', { label }));
      } catch (error) {
        console.error('Disconnect failed', error);
        this.toast.show_error(this.t('Could not disconnect {{label}}. Try again.', { label }));
      } finally {
        this.connections.reload();
      }
    });
  }

  private label_of(connection: IConnectionView): string {
    return connection.account_label ?? this.t('Unnamed account');
  }

  /** Marks one connection busy for the length of an action; a second action on any connection waits. */
  private async run_action(
    connection: IConnectionView,
    action: ConnectionAction,
    work: () => Promise<void>,
  ): Promise<void> {
    if (this.busy_connection_id() !== null) return;
    this.busy_connection_id.set(connection.connection_id);
    this.busy_action.set(action);
    try {
      await work();
    } finally {
      this.busy_connection_id.set(null);
      this.busy_action.set(null);
    }
  }

  private announce_sync(label: string, runs: readonly ISyncRunView[]): void {
    switch (classify_sync_runs(runs)) {
      case SyncOutcome.SUCCESS:
        this.toast.show_success(this.t('Synced {{label}}.', { label }));
        break;
      case SyncOutcome.PARTIAL:
        this.toast.show_info(
          this.t('Synced {{label}} with problems: {{failed}} of {{total}} steps failed.', {
            label,
            failed: runs.filter((run) => run.status === SyncRunStatus.FAILED).length,
            total: runs.length,
          }),
        );
        break;
      case SyncOutcome.FAILED:
        this.toast.show_error(
          this.t('Sync of {{label}} failed. Check the sync history for details.', { label }),
        );
        break;
    }
  }
}

/** A resource wraps the error it was given; the API's error body lives on the original HTTP error. */
function unwrap_error(error: unknown): unknown {
  if (error instanceof HttpErrorResponse) return error;
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  return cause instanceof HttpErrorResponse ? cause : error;
}
