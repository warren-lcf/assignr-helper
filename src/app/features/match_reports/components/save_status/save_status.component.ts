import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SAVE_STATE_PRESENTATION } from '../../constants/save_state_presentation.constant';
import { SaveState } from '../../enums/save_state.enum';
import { format_save_label } from '../../utils/format_save_label';

/**
 * The save indicator at the top of a report: "Saved", "Saving…", or how many changes are waiting while
 * the device is offline or the server cannot be reached. Words and an icon always, and a polite live
 * region so a screen reader hears it change.
 */
@Component({
  selector: 'app-save-status',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './save_status.component.html',
  styleUrl: './save_status.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaveStatusComponent {
  private readonly translation = inject(AppTranslationService);

  /** What the indicator is in. */
  public readonly state = input.required<SaveState>();
  /** How many edits are waiting to be accepted by the server. */
  public readonly waiting_count = input.required<number>();

  public readonly label = computed(() =>
    format_save_label(this.state(), this.waiting_count(), (key, params) => this.t(key, params)),
  );
  public readonly icon = computed(() => SAVE_STATE_PRESENTATION[this.state()].icon);
  /** True for the states that need the referee's attention. */
  public readonly is_waiting = computed(
    () => this.state() === SaveState.OFFLINE || this.state() === SaveState.RETRYING,
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
