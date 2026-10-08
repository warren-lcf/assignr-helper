import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { EmailApiErrorCode } from '../../enums/email_api_error_code.enum';
import { SendOutcomeKind } from '../../enums/send_outcome_kind.enum';
import { ISendDialogData } from '../../models/send_dialog_data.model';
import { ISendDialogOutcome } from '../../models/send_dialog_outcome.model';
import { EmailDraftsApiService } from '../../services/email_drafts_api.service';
import { map_email_api_error } from '../../utils/map_email_api_error';

/**
 * The last step before an email goes out. It states plainly how many people
 * will be emailed, that it happens now and cannot be undone, names the first
 * few recipients (names only, never addresses) and the number of games, and
 * mentions the live quick link when there is one.
 *
 * Cancel has the focus when the dialog opens, so pressing Enter or Space
 * straight away cancels; sending takes a deliberate click on the red button.
 * The dialog sends the request itself: the confirmed recipient count goes with
 * it, the buttons stay disabled while it is in flight (a second click does
 * nothing), and the dialog cannot be dismissed until it answers. When the
 * recipient count changed since the preview, nothing is sent and the dialog
 * closes so the preview can be read again and confirmed afresh.
 */
@Component({
  selector: 'app-send-confirm-dialog',
  standalone: true,
  imports: [MatButtonModule, MatDialogModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './send_confirm_dialog.component.html',
  styleUrl: './send_confirm_dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SendConfirmDialogComponent {
  private readonly api = inject(EmailDraftsApiService);
  private readonly translation = inject(AppTranslationService);
  private readonly dialog_ref =
    inject<MatDialogRef<SendConfirmDialogComponent, ISendDialogOutcome>>(MatDialogRef);

  /** What the sender was shown on the preview. */
  public readonly data = inject<ISendDialogData>(MAT_DIALOG_DATA);

  /** True while the send request is in flight. */
  public readonly is_sending = signal(false);
  /** Why the last attempt failed, or null. */
  public readonly error_message = signal<string | null>(null);

  public readonly headline = computed(() =>
    this.data.recipient_count === 1
      ? this.t('This will email 1 person now and cannot be undone.')
      : this.t('This will email {{count}} people now and cannot be undone.', {
          count: format_count(this.data.recipient_count),
        }),
  );
  public readonly retry_note = computed(() =>
    this.data.is_retry
      ? this.t(
          'This tries again for people the earlier send did not reach. Anyone who already received it is not emailed twice.',
        )
      : null,
  );
  public readonly recipients_text = computed(() => {
    const names = this.data.recipient_names.join(', ');
    return this.data.more_recipient_count > 0
      ? this.t('{{names}} and {{count}} more', {
          names,
          count: format_count(this.data.more_recipient_count),
        })
      : names;
  });
  public readonly games_text = computed(() =>
    this.data.game_count === 1
      ? this.t('1 game')
      : this.t('{{count}} games', { count: format_count(this.data.game_count) }),
  );
  public readonly quick_link_text = computed(() =>
    this.data.include_quick_link
      ? this.t('A live quick link to your open games, expiring in {{days}} days.', {
          days: format_count(this.data.quick_link_expiry_days),
        })
      : null,
  );
  public readonly confirm_label = computed(() =>
    this.data.recipient_count === 1
      ? this.t('Send to 1 person now')
      : this.t('Send to {{count}} people now', {
          count: format_count(this.data.recipient_count),
        }),
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
   * Closes without sending anything.
   * @returns Nothing.
   */
  public cancel(): void {
    if (!this.is_sending()) this.dialog_ref.close();
  }

  /**
   * Sends the email, once. A second call while the request is running does
   * nothing. The dialog closes with the result, or with a note that the
   * recipient count changed; any other failure stays on screen and the
   * sender may try again (the server never emails the same person twice).
   * @returns Resolves when the request has finished.
   */
  public async confirm(): Promise<void> {
    if (this.is_sending()) return;
    this.is_sending.set(true);
    this.dialog_ref.disableClose = true;
    this.error_message.set(null);
    try {
      const result = await firstValueFrom(
        this.api.send_draft(this.data.draft_id, {
          confirm_recipient_count: this.data.recipient_count,
        }),
      );
      this.dialog_ref.close({ kind: SendOutcomeKind.SENT, result });
    } catch (error) {
      console.error('Could not send the email', error);
      const mapped = map_email_api_error(error, (key) => this.t(key));
      if (mapped.code === EmailApiErrorCode.RECIPIENT_COUNT_CHANGED) {
        this.dialog_ref.close({ kind: SendOutcomeKind.COUNT_CHANGED });
        return;
      }
      if (mapped.code === EmailApiErrorCode.DRAFT_LOCKED) {
        this.dialog_ref.close({ kind: SendOutcomeKind.LOCKED });
        return;
      }
      this.error_message.set(mapped.form_error);
    } finally {
      this.is_sending.set(false);
      this.dialog_ref.disableClose = false;
    }
  }
}
