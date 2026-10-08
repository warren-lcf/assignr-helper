import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import {
  EmptyStateComponent,
  SkeletonLineComponent,
  StatusChipComponent,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { FilterBarComponent } from '@hch-shared-libraries/ui-kit/data';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IStatusPresentation } from '../../../connections/models/status_presentation.model';
import { format_count } from '../../../connections/utils/format_count';
import { CONSENT_STATUS_PRESENTATION } from '../../constants/consent_status_presentation.constant';
import { ConsentStatus } from '../../enums/consent_status.enum';
import { IEmailContact } from '../../models/email_contact.model';
import { filter_contacts } from '../../utils/filter_contacts';

/**
 * The tenant's email contacts: a searchable list with each person's consent
 * status (icon and words, never colour alone), and the actions to add one,
 * paste a list, or delete one. A contact who unsubscribed stays in the list,
 * clearly marked, so they are never added again by accident. It only emits;
 * the page runs the dialogs and the requests.
 */
@Component({
  selector: 'app-contacts-panel',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressSpinnerModule,
    EmptyStateComponent,
    FilterBarComponent,
    SkeletonLineComponent,
    StatusChipComponent,
  ],
  templateUrl: './contacts_panel.component.html',
  styleUrl: './contacts_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactsPanelComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = new UserDatePipe();

  /** All the tenant's contacts. */
  public readonly contacts = input.required<IEmailContact[]>();
  /** True while the first list is loading. */
  public readonly is_loading = input(false);
  /** True when the list could not be loaded. */
  public readonly load_failed = input(false);
  /** The contact being deleted, if any; every delete waits for it. */
  public readonly busy_contact_id = input<string | null>(null);

  /** Emits when Add contact is pressed. */
  public readonly add_requested = output<void>();
  /** Emits when Paste a list is pressed. */
  public readonly import_requested = output<void>();
  /** Emits when a contact's Delete button is pressed. */
  public readonly delete_requested = output<IEmailContact>();
  /** Emits when Try again is pressed after a failed load. */
  public readonly retry_requested = output<void>();

  /** What the user typed in the search box (already debounced by the filter bar). */
  public readonly search = signal('');
  public readonly date_format = UserDateFormat.CALENDAR_DATE;

  public readonly shown = computed(() => filter_contacts(this.contacts(), this.search()));
  public readonly summary_text = computed(() => {
    const contacts = this.contacts();
    const granted = contacts.filter(
      (contact) => contact.consent_status === ConsentStatus.GRANTED,
    ).length;
    const label =
      contacts.length === 1
        ? this.t('1 contact')
        : this.t('{{count}} contacts', { count: format_count(contacts.length) });
    return this.t('{{label}}: {{granted}} can receive email, {{unsubscribed}} unsubscribed', {
      label,
      granted: format_count(granted),
      unsubscribed: format_count(contacts.length - granted),
    });
  });
  public readonly skeleton_slots = [0, 1, 2];

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
   * How a contact's consent status is drawn.
   * @param contact The contact.
   * @returns Label, icon and tone.
   */
  public status_of(contact: IEmailContact): IStatusPresentation {
    return CONSENT_STATUS_PRESENTATION[contact.consent_status];
  }

  /**
   * The second detail line for a contact who unsubscribed, or null for one who did not.
   * @param contact The contact.
   * @returns "Unsubscribed on …" or null.
   */
  public unsubscribed_text(contact: IEmailContact): string | null {
    return contact.consent_status === ConsentStatus.UNSUBSCRIBED && contact.unsubscribed_at !== null
      ? this.t('Unsubscribed on {{date}}', {
          date: this.user_date.transform(contact.unsubscribed_at, this.date_format),
        })
      : null;
  }
}
