import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IGameLocationGroup } from '../../models/game_location_group.model';
import { count_location_games } from '../../utils/count_games';
import { format_location_label } from '../../utils/format_location_label';
import { format_games_label } from '../../utils/format_games_label';
import { GameRowComponent } from '../game_row/game_row.component';
import { DATE_HEADING_FORMAT, DATE_HEADING_TIME_ZONE } from '../../constants/date_heading.constant';

/**
 * One location of the agenda as a card: a header that stays in view while its
 * games scroll past, then a heading per calendar date and the date's games in
 * start-time order. The grouped agenda list is a known ui-kit gap (upstream
 * issue #994), so it is composed here from Material.
 */
@Component({
  selector: 'app-game-location-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatListModule,
    CardHeaderComponent,
    UserDatePipe,
    GameRowComponent,
  ],
  templateUrl: './game_location_card.component.html',
  styleUrl: './game_location_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameLocationCardComponent {
  private readonly translation = inject(AppTranslationService);

  /** The location and its dates. */
  public readonly location = input.required<IGameLocationGroup>();
  /** Position among the page's locations; keeps heading ids and test ids unique. */
  public readonly index = input.required<number>();

  public readonly date_heading_format = DATE_HEADING_FORMAT;
  public readonly date_heading_time_zone = DATE_HEADING_TIME_ZONE;

  public readonly heading_id = computed(() => `games-location-heading-${this.index()}`);
  /** The label as shown: the backend's placeholder for an unknown location is translated. */
  public readonly label = computed(() =>
    format_location_label(this.location().location_label, (key) => this.t(key)),
  );
  public readonly games_label = computed(() =>
    format_games_label(count_location_games(this.location()), (key, params) => this.t(key, params)),
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
   * @param date_index Position of the date within the location.
   * @returns The id.
   */
  public date_heading_id(date_index: number): string {
    return `games-date-heading-${this.index()}-${date_index}`;
  }
}
