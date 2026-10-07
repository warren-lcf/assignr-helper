import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormField, form, maxLength, requiredError, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import {
  SecretEntryFormComponent,
  SecretFieldConfig,
  SecretFieldSavedEvent,
} from '@hch-shared-libraries/ui-kit/authorization';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { CLIENT_ID_MAX_LENGTH } from '../../constants/credential_limits.constant';
import { IConnectionView } from '../../models/connection_view.model';
import { IReplaceCredentialsFormModel } from '../../models/replace_credentials_form.model';
import { IReplaceCredentialsRequest } from '../../models/replace_credentials_request.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { map_credentials_api_error } from '../../services/map_credentials_api_error';

/** The one secret field the shared form manages. */
type SecretKey = 'client_secret';

/**
 * Dialog that rotates a connection's client secret, and optionally its client
 * id too. The secret goes through the ui-kit `hch-secret-entry-form`: it shows
 * as already configured, is entered in a masked field, is never echoed back,
 * and the form clears its own copy the instant it emits. This dialog passes the
 * value straight to the API call; it is never put in a signal, a toast or a log.
 *
 * Limits of `hch-secret-entry-form` that shape this dialog: it saves one field
 * at a time through its own Save button, so the optional client id sits beside
 * it as an ordinary field and is sent together with the secret when the secret
 * is saved (the API wants both at once); and it has no slot for an error
 * message, so failures show in a message area under it. After a failed save the
 * field returns to "Configured" and the secret has to be typed again.
 */
@Component({
  selector: 'app-replace-credentials-dialog',
  standalone: true,
  imports: [
    FormField,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    SecretEntryFormComponent,
  ],
  templateUrl: './replace_credentials_dialog.component.html',
  styleUrl: './replace_credentials_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplaceCredentialsDialogComponent {
  private readonly api = inject(ConnectionsApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<ReplaceCredentialsDialogComponent, IConnectionView>>(MatDialogRef);

  /** The connection whose credentials are being replaced. */
  public readonly connection = inject<IConnectionView>(MAT_DIALOG_DATA);

  /** True while the replacement request is in flight. */
  public readonly is_saving = signal(false);
  /** A failure that belongs to the dialog as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** Server complaint about the client id (a 400 violation on `client_id`). */
  public readonly client_id_server_error = signal<string | null>(null);

  public readonly account_name = computed(
    () => this.connection.account_label ?? this.t('Unnamed account'),
  );
  public readonly intro_text = computed(() =>
    this.t(
      'Enter new API credentials for {{label}}. They must belong to the same Assignr account. The secret is never shown again after saving.',
      { label: this.account_name() },
    ),
  );
  /** The shared form's field list: just the write-only secret. */
  public readonly secret_fields = computed<SecretFieldConfig<SecretKey>[]>(() => [
    {
      key: 'client_secret',
      label: this.t('Client secret'),
      is_credential: true,
      hint: this.t('Enter the new secret from your Assignr account.'),
    },
  ]);
  /** The stored secret always exists; its value is never known to the app. */
  public readonly configured: Partial<Record<SecretKey, boolean>> = { client_secret: true };
  public readonly saving_key = computed<SecretKey | null>(() =>
    this.is_saving() ? 'client_secret' : null,
  );

  public readonly model = signal<IReplaceCredentialsFormModel>({ client_id: '' });
  public readonly form = form(this.model, (path) => {
    maxLength(path.client_id, CLIENT_ID_MAX_LENGTH, {
      message: this.t('The client ID can be at most {{max}} characters.', {
        max: CLIENT_ID_MAX_LENGTH,
      }),
    });
    validate(path.client_id, ({ value }) =>
      value().length > 0 && value().trim().length === 0
        ? requiredError({ message: this.t('Leave the client ID blank to keep the current one.') })
        : this.client_id_server_error()
          ? { kind: 'server', message: this.client_id_server_error() ?? '' }
          : undefined,
    );
  });

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
   * Clears a server complaint about the client id once the user edits it.
   * @returns Nothing.
   */
  public on_client_id_edited(): void {
    this.client_id_server_error.set(null);
  }

  /**
   * Sends the new secret (with the new client id when one was typed) and closes
   * with the reconnected connection. The secret exists only as `event.value`
   * for the length of this call.
   * @param event The shared form's save event for the secret field.
   * @returns Resolves when the request has finished.
   */
  public async on_secret_saved(event: SecretFieldSavedEvent<SecretKey>): Promise<void> {
    this.form_error.set(null);
    this.form.client_id().markAsTouched();
    if (this.form.client_id().invalid()) return;

    const client_id = this.model().client_id.trim();
    const request: IReplaceCredentialsRequest =
      client_id.length > 0
        ? { client_secret: event.value, client_id }
        : { client_secret: event.value };
    this.is_saving.set(true);
    try {
      const connection = await firstValueFrom(
        this.api.replace_credentials(this.connection.connection_id, request),
      );
      this.dialog_ref.close(connection);
    } catch (error) {
      console.error('Could not replace the credentials', error);
      const mapped = map_credentials_api_error(error, (key) => this.t(key));
      this.client_id_server_error.set(mapped.field_errors['client_id'] ?? null);
      this.form_error.set(
        mapped.field_errors['client_secret'] ??
          mapped.field_errors['provider'] ??
          mapped.form_error,
      );
    } finally {
      this.is_saving.set(false);
    }
  }
}
