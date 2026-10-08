import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { StatusChipComponent } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IStatusPresentation } from '../../../connections/models/status_presentation.model';
import { format_count } from '../../../connections/utils/format_count';
import { SEND_RESULT_STATUS_PRESENTATION } from '../../constants/send_result_status_presentation.constant';
import { SendResultStatus } from '../../enums/send_result_status.enum';
import { IEmailContact } from '../../models/email_contact.model';
import { ISendDraftResult } from '../../models/send_draft_result.model';
import { ISendRecipientResult } from '../../models/send_recipient_result.model';
import { format_send_failure } from '../../utils/format_send_failure';

/**
 * How a send went: how many people it reached and how many it did not, then
 * one line per recipient with a status (icon and words, never colour alone)
 * and, for a failure, a plain reason. A partly sent email offers "Retry failed
 * recipients". It only emits; the editor runs the retry.
 */
@Component({
  selector: 'app-send-results-panel',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatListModule, StatusChipComponent],
  templateUrl: './send_results_panel.component.html',
  styleUrl: './send_results_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendResultsPanelComponent {
  private readonly translation = inject(AppTranslationService);

  /** The result of the send. */
  public readonly result = input.required<ISendDraftResult>();
  /** The contacts, to turn ids into names. */
  public readonly contacts = input.required<IEmailContact[]>();
  /** Whether the retry button may be pressed now. */
  public readonly can_retry = input(true);

  /** Emits when "Retry failed recipients" is pressed. */
  public readonly retry_requested = output<void>();

  public readonly summary_text = computed(() => {
    const { sent, failed } = this.result();
    const sent_text =
      sent === 1
        ? this.t('Sent to 1 person.')
        : this.t('Sent to {{count}} people.', { count: format_count(sent) });
    if (failed === 0) return sent_text;
    const failed_text =
      failed === 1
        ? this.t('1 person could not be reached.')
        : this.t('{{count}} people could not be reached.', { count: format_count(failed) });
    return `${sent_text} ${failed_text}`;
  });
  public readonly sent_text = computed(() => format_count(this.result().sent));
  public readonly failed_text = computed(() => format_count(this.result().failed));
  public readonly names = computed(
    () => new Map(this.contacts().map((contact) => [contact.contact_id, contact.display_name])),
  );

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
   * The name to show for a recipient.
   * @param row The recipient's result.
   * @returns The contact's display name, or a placeholder for one no longer in the list.
   */
  public name_of(row: ISendRecipientResult): string {
    return this.names().get(row.contact_id) ?? this.t('A contact that is no longer in your list');
  }

  /**
   * How a recipient's status is drawn.
   * @param row The recipient's result.
   * @returns Label, icon and tone.
   */
  public status_of(row: ISendRecipientResult): IStatusPresentation {
    return SEND_RESULT_STATUS_PRESENTATION[row.status];
  }

  /**
   * The reason line for a failed recipient, or null for any other status.
   * @param row The recipient's result.
   * @returns The translated reason.
   */
  public reason_of(row: ISendRecipientResult): string | null {
    return row.status === SendResultStatus.FAILED
      ? format_send_failure(row.error_code, (key) => this.t(key))
      : null;
  }
}
