import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import { UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { format_games_label } from '../../../games/utils/format_games_label';
import { IPublicLocationGroup } from '../../models/public_location_group.model';
import { format_public_location_label } from '../../utils/format_public_location_label';
import { PublicGameRowComponent } from '../public_game_row/public_game_row.component';
import {
  DATE_HEADING_FORMAT,
  DATE_HEADING_TIME_ZONE,
} from '../../../games/constants/date_heading.constant';

/**
 * One location of the public agenda as a card: a header, then a heading per
 * calendar date and the date's games in start-time order.
 */
@Component({
  selector: 'app-public-location-card',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatListModule,
    CardHeaderComponent,
    UserDatePipe,
    PublicGameRowComponent,
  ],
  templateUrl: './public_location_card.component.html',
  styleUrl: './public_location_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicLocationCardComponent {
  private readonly translation = inject(AppTranslationService);

  /** The location and its dates. */
  public readonly location = input.required<IPublicLocationGroup>();
  /** Position among the page locations; keeps heading ids and test ids unique. */
  public readonly index = input.required<number>();

  public readonly date_heading_format = DATE_HEADING_FORMAT;
  public readonly date_heading_time_zone = DATE_HEADING_TIME_ZONE;

  public readonly heading_id = computed(() => `public-location-heading-${this.index()}`);
  public readonly label = computed(() =>
    format_public_location_label(this.location().location_label, (key) => this.t(key)),
  );
  public readonly games_label = computed(() =>
    format_games_label(
      this.location().dates.reduce((total, date) => total + date.games.length, 0),
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
   * @param date_index Position of the date within the location.
   * @returns The id.
   */
  public date_heading_id(date_index: number): string {
    return `public-date-heading-${this.index()}-${date_index}`;
  }
}
