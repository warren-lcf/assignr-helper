import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { ScoreStepperComponent } from '@hch-shared-libraries/ui-kit/common/score_stepper';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SCORE_MAX, SCORE_MIN } from '../../constants/match_report_limits.constant';
import { IScoresChange } from '../../models/scores_change.model';

/**
 * The final score: one big stepper per team (the ui-kit `hch-score-stepper`, 72 px buttons, a right-aligned
 * tabular number, press and hold to repeat). Each tap reports the new score at once; there is no save
 * button. A score nobody has entered yet shows as 0 and counts as missing until the referee taps a
 * stepper or confirms 0 – 0, and entering one side always sets the other too, so a result is never half there.
 */
@Component({
  selector: 'app-score-panel',
  standalone: true,
  imports: [MatCardModule, MatButtonModule, CardHeaderComponent, ScoreStepperComponent],
  templateUrl: './score_panel.component.html',
  styleUrl: './score_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScorePanelComponent {
  private readonly translation = inject(AppTranslationService);

  /** The home team's name. */
  public readonly home_name = input.required<string>();
  /** The away team's name. */
  public readonly away_name = input.required<string>();
  /** The home score, or null while not entered. */
  public readonly home_score = input<number | null>(null);
  /** The away score, or null while not entered. */
  public readonly away_score = input<number | null>(null);
  /** True when the report cannot be edited. */
  public readonly disabled = input(false);

  /** A new final score, with both sides set. */
  public readonly scores_changed = output<IScoresChange>();

  public readonly min = SCORE_MIN;
  public readonly max = SCORE_MAX;

  public readonly home_value = computed(() => this.home_score() ?? 0);
  public readonly away_value = computed(() => this.away_score() ?? 0);
  /** True until both scores have been entered. */
  public readonly is_unset = computed(
    () => this.home_score() === null || this.away_score() === null,
  );
  public readonly home_label = computed(() =>
    this.t('{{team}} (home)', { team: this.home_name() }),
  );
  public readonly away_label = computed(() =>
    this.t('{{team}} (away)', { team: this.away_name() }),
  );
  public readonly range_text = computed(() =>
    this.t('{{min}} to {{max}}', { min: SCORE_MIN, max: SCORE_MAX }),
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
   * The home stepper moved.
   * @param value The new home score.
   * @returns Nothing.
   */
  public on_home_changed(value: number): void {
    this.scores_changed.emit({ home_score: value, away_score: this.away_value() });
  }

  /**
   * The away stepper moved.
   * @param value The new away score.
   * @returns Nothing.
   */
  public on_away_changed(value: number): void {
    this.scores_changed.emit({ home_score: this.home_value(), away_score: value });
  }

  /**
   * Confirms a goalless result without touching a stepper.
   * @returns Nothing.
   */
  public on_confirm_goalless(): void {
    this.scores_changed.emit({ home_score: 0, away_score: 0 });
  }
}
