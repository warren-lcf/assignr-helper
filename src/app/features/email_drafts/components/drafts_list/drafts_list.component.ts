import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  StatusChipComponent,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_count } from '../../../connections/utils/format_count';
import { DRAFT_STATUS_PRESENTATION } from '../../constants/draft_status_presentation.constant';
import { DraftStatus } from '../../enums/draft_status.enum';
import { RecipientMode } from '../../enums/recipient_mode.enum';
import { IEmailDraft } from '../../models/email_draft.model';
import { IStatusPresentation } from '../../../connections/models/status_presentation.model';

/**
 * The drafts as cards: subject, status (icon and text, never colour alone),
 * who it goes to or went to, when it was made and sent. A draft that is still
 * a draft can be edited or deleted; any other can only be opened to look at.
 * It only emits; the page acts.
 */
@Component({
  selector: 'app-drafts-list',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    CardHeaderComponent,
    StatusChipComponent,
    UserDatePipe,
  ],
  templateUrl: './drafts_list.component.html',
  styleUrl: './drafts_list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DraftsListComponent {
  private readonly translation = inject(AppTranslationService);

  /** The drafts to show, in the order given. */
  public readonly drafts = input.required<IEmailDraft[]>();
  /** The draft being deleted, if any; its button shows a spinner and every delete waits. */
  public readonly busy_draft_id = input<string | null>(null);

  /** Emits when a draft's Edit or View button is pressed. */
  public readonly open_requested = output<IEmailDraft>();
  /** Emits when a draft's Delete button is pressed. */
  public readonly delete_requested = output<IEmailDraft>();

  public readonly date_time_format = UserDateFormat.SHORT;

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
   * How a draft's status is drawn.
   * @param draft The draft.
   * @returns Label, icon and tone.
   */
  public status_of(draft: IEmailDraft): IStatusPresentation {
    return DRAFT_STATUS_PRESENTATION[draft.status];
  }

  /**
   * Whether the draft can still be edited and deleted.
   * @param draft The draft.
   * @returns True only for a draft that has not been sent.
   */
  public is_editable(draft: IEmailDraft): boolean {
    return draft.status === DraftStatus.DRAFT;
  }

  /**
   * The recipients line: the number it reached once sent, otherwise who it will go to.
   * @param draft The draft.
   * @returns The text to show.
   */
  public recipients_text(draft: IEmailDraft): string {
    if (draft.recipient_count !== null) return format_count(draft.recipient_count);
    return draft.recipient_mode === RecipientMode.SELECTED
      ? this.t('{{count}} chosen people', { count: format_count(draft.contact_ids.length) })
      : this.t('Everyone who agreed');
  }
}
