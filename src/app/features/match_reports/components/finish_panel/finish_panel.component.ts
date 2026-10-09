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
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { BannerComponent, BannerSeverityEnum } from '@hch-shared-libraries/ui-kit/common/banner';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { REPORT_STATUS_PRESENTATION } from '../../constants/report_status_presentation.constant';
import { ReportStatus } from '../../enums/report_status.enum';
import { TeamSide } from '../../enums/team_side.enum';
import { IMatchReportView } from '../../models/match_report_view.model';
import { IReportBlocker } from '../../models/report_blocker.model';
import { ITeamCardCounts } from '../../models/team_card_counts.model';
import { count_cards, has_no_cards } from '../../utils/count_cards';

/**
 * The end of the report. "Finish report" opens a summary: the final score, the cards for each team and
 * anything still missing. "Mark ready" locks the report; it stays disabled while any change is still
 * waiting to be saved, and when the server says the report is not complete the blockers are listed in
 * words. A ready report shows a calm banner (reports stay in this app for now) and "Reopen to edit".
 */
@Component({
  selector: 'app-finish-panel',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, CardHeaderComponent, BannerComponent],
  templateUrl: './finish_panel.component.html',
  styleUrl: './finish_panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinishPanelComponent {
  private readonly translation = inject(AppTranslationService);

  /** The report as the screen shows it. */
  public readonly report = input.required<IMatchReportView>();
  /** The home team's name. */
  public readonly home_name = input.required<string>();
  /** The away team's name. */
  public readonly away_name = input.required<string>();
  /** How many edits are still waiting to be saved. */
  public readonly pending_count = input(0);
  /** True while marking ready or reopening is in flight. */
  public readonly is_busy = input(false);
  /** What the server said stops the report being marked ready. */
  public readonly blockers = input<readonly IReportBlocker[]>([]);

  /** "Mark ready" was pressed. */
  public readonly mark_ready_requested = output<void>();
  /** "Reopen to edit" was pressed. */
  public readonly reopen_requested = output<void>();

  public readonly banner_severity = BannerSeverityEnum.INFO;
  /** True once "Finish report" was pressed. */
  public readonly is_open = signal(false);

  public readonly is_draft = computed(() => this.report().status === ReportStatus.DRAFT);
  public readonly can_reopen = computed(() => this.report().status === ReportStatus.READY);
  public readonly shows_summary = computed(() => this.is_open() || !this.is_draft());
  public readonly can_mark_ready = computed(
    () => this.is_draft() && this.pending_count() === 0 && !this.is_busy(),
  );
  public readonly status_title = computed(() =>
    this.t(REPORT_STATUS_PRESENTATION[this.report().status].label),
  );
  public readonly home_cards = computed(() => count_cards(this.report().incidents, TeamSide.HOME));
  public readonly away_cards = computed(() => count_cards(this.report().incidents, TeamSide.AWAY));
  /** Each team with its cards, counted on the client with the three kinds apart: a second yellow is its own line. */
  public readonly teams = computed(() => [
    { key: 'home', name: this.home_name(), counts: this.home_cards() },
    { key: 'away', name: this.away_name(), counts: this.away_cards() },
  ]);
  /** Sentences for what the referee has not entered yet. */
  public readonly missing = computed<string[]>(() => {
    const report = this.report();
    const items: string[] = [];
    if (report.home_score === null) {
      items.push(this.t('Enter the final score for {{team}}.', { team: this.home_name() }));
    }
    if (report.away_score === null) {
      items.push(this.t('Enter the final score for {{team}}.', { team: this.away_name() }));
    }
    return items;
  });
  public readonly waiting_text = computed(() =>
    this.pending_count() === 1
      ? this.t('1 change is still saving. You can mark the report ready once it is saved.')
      : this.t(
          '{{count}} changes are still saving. You can mark the report ready once they are saved.',
          { count: this.pending_count() },
        ),
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
   * A score as text.
   * @param score The score, or null when not entered.
   * @returns The number, or a dash.
   */
  public score_text(score: number | null): string {
    return score === null ? '–' : String(score);
  }

  /**
   * Whether a team has no cards at all.
   * @param counts The team's counts.
   * @returns True when every count is zero.
   */
  public has_no_cards(counts: ITeamCardCounts): boolean {
    return has_no_cards(counts);
  }
}
