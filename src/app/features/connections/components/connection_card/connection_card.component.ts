import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { StatusChipComponent, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CONNECTION_STATUS_PRESENTATION } from '../../constants/connection_status_presentation.constant';
import { INTEGRATION_PROVIDER_LABEL } from '../../constants/integration_provider_label.constant';
import { ConnectionAction } from '../../enums/connection_action.enum';
import { ConnectionStatus } from '../../enums/connection_status.enum';
import { IConnectionView } from '../../models/connection_view.model';

/**
 * One connection as a card: account, provider, status (icon and text, never
 * colour alone), when it last synced, the last error, and the actions the
 * viewer may take. It only emits; the page acts.
 */
@Component({
  selector: 'app-connection-card',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    CardHeaderComponent,
    StatusChipComponent,
    UserDatePipe,
  ],
  templateUrl: './connection_card.component.html',
  styleUrl: './connection_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionCardComponent {
  private readonly translation = inject(AppTranslationService);

  /** The connection to show. */
  public readonly connection = input.required<IConnectionView>();
  /** Whether the viewer holds `connections.manage`: shows test, replace and disconnect. */
  public readonly can_manage = input(false);
  /** Whether the viewer holds `sync.run`: shows "Sync now". */
  public readonly can_sync = input(false);
  /** The action currently running on this connection, which disables the others. */
  public readonly busy_action = input<ConnectionAction | null>(null);

  /** Emits when "Sync now" is pressed. */
  public readonly sync_requested = output<IConnectionView>();
  /** Emits when "Test connection" is pressed. */
  public readonly test_requested = output<IConnectionView>();
  /** Emits when "Replace credentials" is pressed. */
  public readonly replace_requested = output<IConnectionView>();
  /** Emits when "Disconnect" is pressed. */
  public readonly disconnect_requested = output<IConnectionView>();

  public readonly connection_action = ConnectionAction;

  public readonly account_name = computed(
    () => this.connection().account_label ?? this.t('Unnamed account'),
  );
  public readonly provider_label = computed(() =>
    this.t(INTEGRATION_PROVIDER_LABEL[this.connection().provider]),
  );
  public readonly status = computed(() => CONNECTION_STATUS_PRESENTATION[this.connection().status]);
  public readonly is_busy = computed(() => this.busy_action() !== null);
  /** "Sync now" is only offered for a connection the backend would sync. */
  public readonly show_sync = computed(
    () => this.can_sync() && this.connection().status === ConnectionStatus.CONNECTED,
  );
  /** Test and disconnect make no sense once the credentials are gone. */
  public readonly show_test_and_disconnect = computed(
    () => this.can_manage() && this.connection().status !== ConnectionStatus.DISCONNECTED,
  );
  public readonly has_actions = computed(() => this.show_sync() || this.can_manage());

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}
