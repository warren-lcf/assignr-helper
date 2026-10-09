import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ScoreStepperComponent } from '@hch-shared-libraries/ui-kit/common/score_stepper';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  MINUTE_MAX,
  MINUTE_MIN,
  MINUTE_QUICK_VALUES,
} from '../../constants/match_report_limits.constant';

/**
 * The minute a card is shown in: a big minute with minus and plus (the ui-kit `hch-score-stepper`, 72 px
 * buttons, press and hold to repeat) and one-tap shortcuts for the common minutes. The host decides
 * which minute to start from; this only shows and changes it.
 */
@Component({
  selector: 'app-minute-picker',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, ScoreStepperComponent],
  templateUrl: './minute_picker.component.html',
  styleUrl: './minute_picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MinutePickerComponent {
  private readonly translation = inject(AppTranslationService);

  /** The minute shown, 1 to 130. */
  public readonly minute = input.required<number>();
  /** True when the minute cannot be changed. */
  public readonly disabled = input(false);

  /** The minute the referee chose. */
  public readonly minute_changed = output<number>();

  public readonly min = MINUTE_MIN;
  public readonly max = MINUTE_MAX;
  public readonly quick_values = MINUTE_QUICK_VALUES;

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
   * A quick minute was tapped.
   * @param value The minute.
   * @returns Nothing.
   */
  public on_quick_value(value: number): void {
    this.minute_changed.emit(value);
  }
}
