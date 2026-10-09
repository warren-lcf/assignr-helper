import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import {
  StatusChipComponent,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IStatusPresentation } from '../../../connections/models/status_presentation.model';
import { format_agenda_date_heading } from '../../../games/utils/format_agenda_date_heading';
import { format_game_title } from '../../../games/utils/format_game_title';
import {
  NO_REPORT_PRESENTATION,
  REPORT_STATUS_PRESENTATION,
} from '../../constants/report_status_presentation.constant';
import { ReportStatus } from '../../enums/report_status.enum';
import { IGameReportEntry } from '../../models/game_report_entry.model';

/**
 * One game on the report list: teams, kick-off on the venue's own clock, venue, a status chip (icon and
 * words) and, when a report exists, its score and card counts right-aligned. Offers the one action that
 * fits: start the report, continue it, or view it.
 */
@Component({
  selector: 'app-report-game-row',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, StatusChipComponent, UserDatePipe],
  templateUrl: './report_game_row.component.html',
  styleUrl: './report_game_row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportGameRowComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = new UserDatePipe();

  /** The game and its report, if one was started. */
  public readonly entry = input.required<IGameReportEntry>();
  /** False hides the open button, for someone who may read reports but not write them. */
  public readonly can_open = input(true);

  /** The referee wants to open this game's report. */
  public readonly open_requested = output<IGameReportEntry>();

  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the viewer's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;

  public readonly game = computed(() => this.entry().game);
  public readonly report = computed(() => this.entry().report);
  public readonly title = computed(() =>
    format_game_title(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly date_text = computed(() =>
    format_agenda_date_heading(this.game().local_date, (key) => this.t(key), this.user_date),
  );
  public readonly status = computed<IStatusPresentation>(() => {
    const report = this.report();
    return report === null ? NO_REPORT_PRESENTATION : REPORT_STATUS_PRESENTATION[report.status];
  });
  public readonly score_text = computed(() => {
    const report = this.report();
    if (report === null) return '';
    const side = (score: number | null): string => (score === null ? '–' : String(score));
    return `${side(report.home_score)} – ${side(report.away_score)}`;
  });
  public readonly action_label = computed(() => {
    const report = this.report();
    if (report === null) return this.t('Start report');
    return report.status === ReportStatus.DRAFT ? this.t('Continue report') : this.t('View report');
  });
  public readonly action_name = computed(() =>
    this.t('{{action}}: {{game}}', { action: this.action_label(), game: this.title() }),
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
