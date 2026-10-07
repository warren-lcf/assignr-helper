import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  FormField,
  FormRoot,
  TreeValidationResult,
  form,
  maxLength,
  required,
  requiredError,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  CLIENT_ID_MAX_LENGTH,
  CLIENT_SECRET_MAX_LENGTH,
} from '../../constants/credential_limits.constant';
import { INTEGRATION_PROVIDER_LABEL } from '../../constants/integration_provider_label.constant';
import { IntegrationProvider } from '../../enums/integration_provider.enum';
import { IAddConnectionFormModel } from '../../models/add_connection_form.model';
import { IConnectionView } from '../../models/connection_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { map_credentials_api_error } from '../../services/map_credentials_api_error';

/** A blank form: the only provider so far, no credentials. */
function blank_model(): IAddConnectionFormModel {
  return { provider: IntegrationProvider.ASSIGNR, client_id: '', client_secret: '' };
}

/**
 * Dialog that connects a provider account with the tenant's own client id and
 * secret. The secret is write-only: a password input without a reveal
 * toggle, held only in the form's model, sent once, then wiped. Client
 * validation shows inline; the server's rejection of the credentials, an
 * account mismatch, or an unreachable provider come back as inline messages.
 * Closes with the new connection on success.
 */
@Component({
  selector: 'app-add-connection-dialog',
  standalone: true,
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './add_connection_dialog.component.html',
  styleUrl: './add_connection_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddConnectionDialogComponent {
  private readonly api = inject(ConnectionsApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<AddConnectionDialogComponent, IConnectionView>>(MatDialogRef);

  /** The form's value; the one place the secret is held. */
  public readonly model = signal<IAddConnectionFormModel>(blank_model());
  /** A failure that belongs to the form as a whole (account mismatch, provider down, ...). */
  public readonly form_error = signal<string | null>(null);
  /** The providers on offer. */
  public readonly provider_options = computed(() =>
    Object.values(IntegrationProvider).map((value) => ({
      value,
      label: this.t(INTEGRATION_PROVIDER_LABEL[value]),
    })),
  );

  public readonly form = form(
    this.model,
    (path) => {
      required(path.provider, { message: this.t('Choose a provider.') });
      required(path.client_id, { message: this.t('Enter the client ID.') });
      maxLength(path.client_id, CLIENT_ID_MAX_LENGTH, {
        message: this.t('The client ID can be at most {{max}} characters.', {
          max: CLIENT_ID_MAX_LENGTH,
        }),
      });
      validate(path.client_id, ({ value }) =>
        value().length > 0 && value().trim().length === 0
          ? requiredError({ message: this.t('Enter the client ID.') })
          : undefined,
      );
      required(path.client_secret, { message: this.t('Enter the client secret.') });
      maxLength(path.client_secret, CLIENT_SECRET_MAX_LENGTH, {
        message: this.t('The client secret can be at most {{max}} characters.', {
          max: CLIENT_SECRET_MAX_LENGTH,
        }),
      });
      validate(path.client_secret, ({ value }) =>
        value().length > 0 && value().trim().length === 0
          ? requiredError({ message: this.t('Enter the client secret.') })
          : undefined,
      );
    },
    { submission: { action: () => this.connect() } },
  );

  public constructor() {
    effect(() => {
      this.dialog_ref.disableClose = this.form().submitting();
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
   * Sends the credentials. On success the secret is wiped and the dialog
   * closes with the connection; on failure the server's reason is returned as
   * errors on the matching fields, or kept as the form-level message.
   * @returns Field errors for the form to show, or nothing on success.
   */
  private async connect(): Promise<TreeValidationResult> {
    this.form_error.set(null);
    const { provider, client_id, client_secret } = this.model();
    try {
      const connection = await firstValueFrom(
        this.api.create_connection({
          provider,
          client_id: client_id.trim(),
          client_secret: client_secret.trim(),
        }),
      );
      this.model.set(blank_model());
      this.dialog_ref.close(connection);
      return undefined;
    } catch (error) {
      console.error('Could not add the connection', error);
      const mapped = map_credentials_api_error(error, (key) => this.t(key));
      this.form_error.set(mapped.form_error);
      const fields = {
        provider: this.form.provider,
        client_id: this.form.client_id,
        client_secret: this.form.client_secret,
      } as const;
      return Object.entries(mapped.field_errors).flatMap(([path, message]) =>
        path in fields
          ? [{ kind: 'server', message, fieldTree: fields[path as keyof typeof fields] }]
          : [],
      );
    }
  }
}
