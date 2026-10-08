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
  requiredError,
  validate,
} from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  SecretEntryFormComponent,
  SecretFieldConfig,
  SecretFieldSavedEvent,
} from '@hch-shared-libraries/ui-kit/authorization';
import {
  ConfirmationDialogComponent,
  ConfirmationDialogData,
} from '@hch-shared-libraries/ui-kit/core';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  EMAIL_ADDRESS_MAX_LENGTH,
  FROM_NAME_MAX_LENGTH,
  POSTAL_ADDRESS_MAX_LENGTH,
} from '../../constants/email_limits.constant';
import { EmailSettingsChange } from '../../enums/email_settings_change.enum';
import { SettingsSecretKey } from '../../enums/settings_secret_key.enum';
import { IEmailSettings } from '../../models/email_settings.model';
import { IEmailSettingsFormModel } from '../../models/email_settings_form.model';
import { ISaveEmailSettingsRequest } from '../../models/save_email_settings_request.model';
import { EmailSettingsApiService } from '../../services/email_settings_api.service';
import { is_plausible_email } from '../../utils/is_plausible_email';
import { map_email_api_error } from '../../utils/map_email_api_error';

/** Request fields a failed save can be shown under. */
const SETTINGS_ERROR_FIELDS: readonly string[] = [
  'from_email',
  'from_name',
  'reply_to',
  'postal_address',
  'api_key',
];

/**
 * Dialog for the sender settings: who the email comes from (address, name,
 * reply-to) and the postal address recipients should be able to see, plus the
 * SendGrid API key.
 *
 * The API key goes through the ui-kit `hch-secret-entry-form`: write-only, shown
 * as "Configured" once stored, never echoed back. It exists only as the value
 * of the one save request; it is never put in a signal, a toast or a log. The
 * shared form saves one field at a time through its own Save button, so the
 * other fields are saved together with the key when it is saved, and, once
 * sending is set up, with the dialog's own Save button (which leaves the stored
 * key untouched).
 */
@Component({
  selector: 'app-email-settings-dialog',
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
    SecretEntryFormComponent,
  ],
  templateUrl: './email_settings_dialog.component.html',
  styleUrl: './email_settings_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailSettingsDialogComponent {
  private readonly api = inject(EmailSettingsApiService);
  private readonly dialog = inject(MatDialog);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<EmailSettingsDialogComponent, EmailSettingsChange>>(MatDialogRef);

  /** The settings as stored (never the key). */
  public readonly settings = inject<IEmailSettings>(MAT_DIALOG_DATA);

  /** True while a save or remove is in flight. */
  public readonly is_busy = signal(false);
  /** True while the key is being saved through the shared secret form. */
  public readonly is_saving_secret = signal(false);
  /** A failure that belongs to the dialog as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** Server complaints about fields, shown under them until they are edited. */
  public readonly server_errors = signal<Record<string, string>>({});

  public readonly model = signal<IEmailSettingsFormModel>({
    from_email: this.settings.from_email ?? '',
    from_name: this.settings.from_name ?? '',
    reply_to: this.settings.reply_to ?? '',
    postal_address: this.settings.postal_address ?? '',
  });

  /** The shared form's field list: just the write-only key. */
  public readonly secret_fields = computed<SecretFieldConfig<SettingsSecretKey>[]>(() => [
    {
      key: SettingsSecretKey.API_KEY,
      label: this.t('SendGrid API key'),
      is_credential: true,
      hint: this.t('Create a key with "Mail Send" permission in your SendGrid account.'),
    },
  ]);
  /** Whether a key is stored; its value is never known to the app. */
  public readonly configured = computed<Partial<Record<SettingsSecretKey, boolean>>>(() => ({
    [SettingsSecretKey.API_KEY]: this.settings.configured,
  }));
  public readonly saving_key = computed<SettingsSecretKey | null>(() =>
    this.is_saving_secret() ? SettingsSecretKey.API_KEY : null,
  );

  public readonly form = form(
    this.model,
    (path) => {
      validate(path.from_email, ({ value }) => {
        const email = value().trim();
        if (email.length === 0)
          return requiredError({ message: this.t('Enter the sender address.') });
        return is_plausible_email(email)
          ? this.server_error('from_email')
          : { kind: 'email', message: this.t('Enter a valid email address.') };
      });
      maxLength(path.from_name, FROM_NAME_MAX_LENGTH, {
        message: this.t('The name can be at most {{max}} characters.', {
          max: FROM_NAME_MAX_LENGTH,
        }),
      });
      validate(path.from_name, () => this.server_error('from_name'));
      validate(path.reply_to, ({ value }) => {
        const email = value().trim();
        if (email.length > 0 && !is_plausible_email(email)) {
          return { kind: 'email', message: this.t('Enter a valid email address.') };
        }
        return this.server_error('reply_to');
      });
      maxLength(path.postal_address, POSTAL_ADDRESS_MAX_LENGTH, {
        message: this.t('The address can be at most {{max}} characters.', {
          max: POSTAL_ADDRESS_MAX_LENGTH,
        }),
      });
      validate(path.postal_address, () => this.server_error('postal_address'));
    },
    { submission: { action: () => this.save_settings(null) } },
  );

  public readonly email_max = EMAIL_ADDRESS_MAX_LENGTH;

  public constructor() {
    effect(() => {
      // A save or removal in flight must not be cancelled by Escape or a click outside.
      this.dialog_ref.disableClose = this.is_busy();
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
   * Clears a server complaint about a field once the user edits it.
   * @param field The request field name.
   * @returns Nothing.
   */
  public on_field_edited(field: string): void {
    if (field in this.server_errors()) {
      const remaining = { ...this.server_errors() };
      delete remaining[field];
      this.server_errors.set(remaining);
    }
  }

  /**
   * Saves the key together with the other fields. The key exists only as
   * `event.value` for the length of this call.
   * @param event The shared form's save event for the key.
   * @returns Resolves when the request has finished.
   */
  public async on_secret_saved(event: SecretFieldSavedEvent<SettingsSecretKey>): Promise<void> {
    this.form().markAsTouched();
    if (this.form().invalid()) return;
    this.is_saving_secret.set(true);
    try {
      await this.save_settings(event.value);
    } finally {
      this.is_saving_secret.set(false);
    }
  }

  /**
   * Asks for confirmation, then removes the sender settings and the stored key.
   * @returns Resolves when the dialog has closed and any removal is done.
   */
  public async on_remove_requested(): Promise<void> {
    if (this.is_busy()) return;
    const data: ConfirmationDialogData = {
      title: this.t('Remove the sender settings?'),
      message: this.t(
        'Sending from {{sender}} stops working and the stored SendGrid API key is deleted. Your drafts and contacts are kept. You can set sending up again at any time.',
        { sender: this.settings.from_email ?? this.t('this account') },
      ),
      confirm_button_label: this.t('Remove settings'),
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

    this.is_busy.set(true);
    this.form_error.set(null);
    try {
      await firstValueFrom(this.api.remove_settings());
      this.dialog_ref.close(EmailSettingsChange.REMOVED);
    } catch (error) {
      console.error('Could not remove the sender settings', error);
      this.form_error.set(map_email_api_error(error, (key) => this.t(key)).form_error);
    } finally {
      this.is_busy.set(false);
    }
  }

  private server_error(field: string): { kind: string; message: string } | undefined {
    const message = this.server_errors()[field];
    return message ? { kind: 'server', message } : undefined;
  }

  /**
   * Sends the settings. The key is only passed in when it is being set.
   * @param api_key The new key, or null to keep the stored one.
   * @returns Nothing; failures are shown on the dialog.
   */
  private async save_settings(api_key: string | null): Promise<TreeValidationResult> {
    this.form_error.set(null);
    this.is_busy.set(true);
    const model = this.model();
    const request: ISaveEmailSettingsRequest = {
      from_email: model.from_email.trim(),
      from_name: model.from_name.trim() || null,
      reply_to: model.reply_to.trim() || null,
      postal_address: model.postal_address.trim() || null,
      ...(api_key === null ? {} : { api_key }),
    };
    try {
      await firstValueFrom(this.api.save_settings(request));
      this.dialog_ref.close(EmailSettingsChange.SAVED);
    } catch (error) {
      console.error('Could not save the sender settings', error);
      const mapped = map_email_api_error(error, (key) => this.t(key), SETTINGS_ERROR_FIELDS);
      const { api_key: key_error, ...field_errors } = mapped.field_errors;
      this.server_errors.set(field_errors);
      this.form_error.set(key_error ?? mapped.form_error);
    } finally {
      this.is_busy.set(false);
    }
    return undefined;
  }
}
