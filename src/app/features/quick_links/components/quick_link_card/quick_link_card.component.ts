import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
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
import { QUICK_LINK_STATE_PRESENTATION } from '../../constants/quick_link_state_presentation.constant';
import { QuickLinkState } from '../../enums/quick_link_state.enum';
import { IQuickLinkView } from '../../models/quick_link_view.model';
import { format_quick_link_label } from '../../utils/format_quick_link_label';
import { summarize_quick_link_scope } from '../../utils/summarize_quick_link_scope';

/**
 * One quick link as a card: its state (icon and text, never colour alone), what
 * it shows, when it was created, expires and was last opened, how often it was
 * opened, and a Revoke action while it still works. It never shows a token: the
 * server does not keep one. It only emits; the page acts.
 */
@Component({
  selector: 'app-quick-link-card',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    CardHeaderComponent,
    StatusChipComponent,
    UserDatePipe,
  ],
  templateUrl: './quick_link_card.component.html',
  styleUrl: './quick_link_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickLinkCardComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = new UserDatePipe();

  /** The link to show. */
  public readonly link = input.required<IQuickLinkView>();
  /** Whether the viewer holds `quick_links.manage`: shows Revoke. */
  public readonly can_manage = input(false);
  /** True while a revoke is running on this link. */
  public readonly is_busy = input(false);
  /** True while a revoke runs on any link, which disables this one's button without a spinner. */
  public readonly is_locked = input(false);

  /** Emits when Revoke is pressed. */
  public readonly revoke_requested = output<IQuickLinkView>();

  public readonly date_time_format = UserDateFormat.SHORT;

  public readonly label = computed(() =>
    format_quick_link_label(
      this.link().created_at,
      (utc_ms) => this.user_date.transform(utc_ms, UserDateFormat.SHORT),
      (key, params) => this.t(key, params),
    ),
  );
  public readonly state = computed(() => QUICK_LINK_STATE_PRESENTATION[this.link().state]);
  public readonly scope_lines = computed(() =>
    summarize_quick_link_scope(
      this.link().scope,
      (utc_ms) => this.user_date.transform(utc_ms, UserDateFormat.CALENDAR_DATE),
      (key, params) => this.t(key, params),
    ),
  );
  public readonly view_count_text = computed(() => format_count(this.link().view_count));
  /** Revoking only makes sense while the link still works. */
  public readonly show_revoke = computed(
    () => this.can_manage() && this.link().state === QuickLinkState.ACTIVE,
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
}
