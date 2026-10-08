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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  CONTACT_NAME_MAX_LENGTH,
  EMAIL_ADDRESS_MAX_LENGTH,
} from '../../constants/email_limits.constant';
import { IContactFormModel } from '../../models/contact_form.model';
import { IEmailContact } from '../../models/email_contact.model';
import { EmailContactsApiService } from '../../services/email_contacts_api.service';
import { is_plausible_email } from '../../utils/is_plausible_email';
import { map_email_api_error } from '../../utils/map_email_api_error';

/** Request fields a failed add can be shown under. */
const CONTACT_ERROR_FIELDS: readonly string[] = ['display_name', 'email_address'];

/**
 * Dialog that adds one contact. Adding requires ticking the consent
 * confirmation ("I confirm this person agreed to receive these emails"),
 * which is what the request attests with `consent_attested: true`. Without
 * it nothing is sent and the checkbox says why. Closes with the new contact.
 */
@Component({
  selector: 'app-add-contact-dialog',
  standalone: true,
  imports: [
    FormField,
    FormRoot,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './add_contact_dialog.component.html',
  styleUrl: './add_contact_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddContactDialogComponent {
  private readonly api = inject(EmailContactsApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<AddContactDialogComponent, IEmailContact>>(MatDialogRef);

  /** The form's value. */
  public readonly model = signal<IContactFormModel>({
    display_name: '',
    email_address: '',
    consent_attested: false,
  });
  /** A failure that belongs to the form as a whole. */
  public readonly form_error = signal<string | null>(null);
  /** True once the person has tried to add, so a missing consent tick is called out. */
  public readonly attempted = signal(false);
  public readonly show_consent_error = computed(
    () => this.attempted() && !this.model().consent_attested,
  );

  public readonly form = form(
    this.model,
    (path) => {
      validate(path.display_name, ({ value }) =>
        value().trim().length === 0
          ? requiredError({ message: this.t('Enter a name.') })
          : undefined,
      );
      maxLength(path.display_name, CONTACT_NAME_MAX_LENGTH, {
        message: this.t('The name can be at most {{max}} characters.', {
          max: CONTACT_NAME_MAX_LENGTH,
        }),
      });
      validate(path.email_address, ({ value }) => {
        const email = value().trim();
        if (email.length === 0) {
          return requiredError({ message: this.t('Enter an email address.') });
        }
        return is_plausible_email(email) && email.length <= EMAIL_ADDRESS_MAX_LENGTH
          ? undefined
          : { kind: 'email', message: this.t('Enter a valid email address.') };
      });
      validate(path.consent_attested, ({ value }) =>
        value()
          ? undefined
          : {
              kind: 'consent',
              message: this.t('Confirm that this person agreed to receive these emails.'),
            },
      );
    },
    { submission: { action: () => this.create() } },
  );

  public constructor() {
    effect(() => {
      // A request in flight must not be cancelled by Escape or a click outside.
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
   * Records the consent tick.
   * @param checked Whether the box is ticked.
   * @returns Nothing.
   */
  public on_consent_changed(checked: boolean): void {
    this.model.update((model) => ({ ...model, consent_attested: checked }));
  }

  /**
   * Sends the request. On success the dialog closes with the new contact; on
   * failure the server's reasons come back as errors on the matching fields.
   * @returns Field errors for the form to show, or nothing on success.
   */
  private async create(): Promise<TreeValidationResult> {
    this.form_error.set(null);
    const model = this.model();
    try {
      const contact = await firstValueFrom(
        this.api.create_contact({
          display_name: model.display_name.trim(),
          email_address: model.email_address.trim(),
          consent_attested: true,
        }),
      );
      this.dialog_ref.close(contact);
      return undefined;
    } catch (error) {
      console.error('Could not add the contact', error);
      const mapped = map_email_api_error(error, (key) => this.t(key), CONTACT_ERROR_FIELDS);
      this.form_error.set(mapped.form_error);
      const fields = {
        display_name: this.form.display_name,
        email_address: this.form.email_address,
      } as const;
      return Object.entries(mapped.field_errors).flatMap(([name, message]) =>
        name in fields
          ? [{ kind: 'server', message, fieldTree: fields[name as keyof typeof fields] }]
          : [],
      );
    }
  }
}
