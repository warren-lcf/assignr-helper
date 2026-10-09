import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { UserDateFormat, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IGameDateGroup } from '../../models/game_date_group.model';
import { format_games_label } from '../../utils/format_games_label';
import { GameRowComponent } from '../game_row/game_row.component';

/**
 * All games in one card, by calendar date and then start time, with no grouping by venue. Each row
 * names its own location, since no location heading says where it is played. This is the "Group by
 * venue" switch turned off; like the grouped list it is composed from Material (ui-kit issue #994).
 */
@Component({
  selector: 'app-games-by-date-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatListModule,
    CardHeaderComponent,
    UserDatePipe,
    GameRowComponent,
  ],
  templateUrl: './games_by_date_card.component.html',
  styleUrl: './games_by_date_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GamesByDateCardComponent {
  private readonly translation = inject(AppTranslationService);

  /** The dates and their games, already in order. */
  public readonly dates = input.required<IGameDateGroup[]>();

  public readonly calendar_date_format = UserDateFormat.CALENDAR_DATE;

  public readonly games_label = computed(() =>
    format_games_label(
      this.dates().reduce((sum, date) => sum + date.games.length, 0),
      (key, params) => this.t(key, params),
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
   * Gives each date section a unique heading id.
   * @param date_index Position of the date in the list.
   * @returns The id.
   */
  public date_heading_id(date_index: number): string {
    return `games-by-date-heading-${date_index}`;
  }
}
