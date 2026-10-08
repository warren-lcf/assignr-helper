import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule, MatSelectionListChange } from '@angular/material/list';
import { MatRadioModule } from '@angular/material/radio';
import { StatusChipComponent } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { CONSENT_STATUS_PRESENTATION } from '../../constants/consent_status_presentation.constant';
import { MAX_RECIPIENTS_PER_SEND } from '../../constants/email_limits.constant';
import { ConsentStatus } from '../../enums/consent_status.enum';
import { RecipientMode } from '../../enums/recipient_mode.enum';
import { IEmailContact } from '../../models/email_contact.model';

/**
 * Who a draft goes to: everyone who agreed, or specific people chosen with
 * checkboxes (with select all and none). A contact who unsubscribed is listed
 * and marked, but cannot be chosen: they never receive these emails. It only
 * edits its two models; the editor decides when to save.
 */
@Component({
  selector: 'app-recipient-picker',
  standalone: true,
  imports: [MatButtonModule, MatListModule, MatRadioModule, StatusChipComponent],
  templateUrl: './recipient_picker.component.html',
  styleUrl: './recipient_picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecipientPickerComponent {
  private readonly translation = inject(AppTranslationService);

  /** All the tenant's contacts. */
  public readonly contacts = input.required<IEmailContact[]>();
  /** Who the draft goes to. */
  public readonly mode = model.required<RecipientMode>();
  /** The chosen contacts' ids; used when the mode is SELECTED. */
  public readonly selected_ids = model.required<string[]>();
  /** True while the draft cannot be edited (sent or sending). */
  public readonly is_disabled = input(false);

  public readonly modes = RecipientMode;
  public readonly unsubscribed_presentation =
    CONSENT_STATUS_PRESENTATION[ConsentStatus.UNSUBSCRIBED];
  public readonly max_recipients = MAX_RECIPIENTS_PER_SEND;

  /** Contacts who agreed and have not unsubscribed. */
  public readonly consenting = computed(() =>
    this.contacts().filter((contact) => contact.consent_status === ConsentStatus.GRANTED),
  );
  /** How many of the chosen contacts can actually be emailed. */
  public readonly chosen_count = computed(() => {
    const chosen = new Set(this.selected_ids());
    return this.consenting().filter((contact) => chosen.has(contact.contact_id)).length;
  });
  public readonly everyone_label = computed(() =>
    this.t('Everyone who agreed ({{count}})', { count: format_count(this.consenting().length) }),
  );
  public readonly chosen_text = computed(() =>
    this.t('{{count}} chosen of {{max}} allowed per send', {
      count: format_count(this.chosen_count()),
      max: format_count(this.max_recipients),
    }),
  );
  public readonly over_limit_text = computed(() =>
    this.t('One send can reach at most {{max}} people. Choose fewer and send in batches.', {
      max: this.max_recipients,
    }),
  );
  public readonly is_over_limit = computed(() => this.chosen_count() > this.max_recipients);

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
   * Whether a contact is currently chosen.
   * @param contact The contact.
   * @returns True when chosen.
   */
  public is_chosen(contact: IEmailContact): boolean {
    return this.selected_ids().includes(contact.contact_id);
  }

  /**
   * Whether a contact has unsubscribed and so cannot be chosen.
   * @param contact The contact.
   * @returns True for an unsubscribed contact.
   */
  public is_unsubscribed(contact: IEmailContact): boolean {
    return contact.consent_status === ConsentStatus.UNSUBSCRIBED;
  }

  /**
   * Switches between everyone and chosen people; an unknown value is ignored.
   * @param value The mode as the radio group reports it.
   * @returns Nothing.
   */
  public on_mode_changed(value: string): void {
    const mode = Object.values(RecipientMode).find((candidate) => candidate === value);
    if (mode) this.mode.set(mode);
  }

  /**
   * Applies the checkboxes the user just changed.
   * @param event The selection list's change event.
   * @returns Nothing.
   */
  public on_selection_changed(event: MatSelectionListChange): void {
    const changed = new Map<string, boolean>(
      event.options.map((option) => [String(option.value), option.selected]),
    );
    const eligible = new Set(this.consenting().map((contact) => contact.contact_id));
    this.selected_ids.update((ids) => {
      const next = new Set(ids);
      for (const [contact_id, is_selected] of changed) {
        if (!eligible.has(contact_id)) continue;
        if (is_selected) next.add(contact_id);
        else next.delete(contact_id);
      }
      return [...next];
    });
  }

  /**
   * Chooses every contact who agreed.
   * @returns Nothing.
   */
  public select_all(): void {
    this.selected_ids.set(this.consenting().map((contact) => contact.contact_id));
  }

  /**
   * Clears the choice.
   * @returns Nothing.
   */
  public select_none(): void {
    this.selected_ids.set([]);
  }
}
