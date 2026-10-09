import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  StatusChipComponent,
  StatusToneEnum,
  USER_DATE_LOCALE,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { IGameView } from '../../../games/models/game_view.model';
import { format_agenda_date_heading } from '../../../games/utils/format_agenda_date_heading';
import { format_game_title } from '../../../games/utils/format_game_title';
import { format_location_label } from '../../../games/utils/format_location_label';
import { NextUpTiming } from '../../enums/next_up_timing.enum';
import { format_next_up_note } from '../../utils/format_next_up_note';
import { get_next_up_timing } from '../../utils/get_next_up_timing';

/**
 * The "Next up" card at the top of My Schedule: the referee's next game with its teams, the weekday
 * and date, kick-off on the venue's own clock with its zone, where it is, which position the referee
 * has, and a relative note ("Starts in 3 hours"). With no game it says there is nothing coming up.
 * Read-only: it emits nothing.
 */
@Component({
  selector: 'app-next-up-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule, CardHeaderComponent, StatusChipComponent, UserDatePipe],
  providers: [UserDatePipe],
  templateUrl: './next_up_card.component.html',
  styleUrl: './next_up_card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NextUpCardComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = inject(UserDatePipe);
  private readonly resolve_locale = inject(USER_DATE_LOCALE);

  /** The next game, or null when there is none to come. */
  public readonly game = input.required<IGameView | null>();
  /** The current time, UTC milliseconds; the page re-reads it every minute. */
  public readonly now = input.required<number>();

  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the viewer's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;
  public readonly tone = StatusToneEnum;

  public readonly title = computed(() => {
    const game = this.game();
    return game === null ? '' : format_game_title(game, (key, params) => this.t(key, params));
  });
  /** "Saturday, Oct 10"; a game without a calendar date is dated by its kick-off on its own clock. */
  public readonly date_text = computed(() => {
    const game = this.game();
    if (game === null) return '';
    return game.local_date === null
      ? this.user_date.transform(game.start_at, UserDateFormat.WEEKDAY_DATE, game.time_zone)
      : format_agenda_date_heading(game.local_date, (key) => this.t(key), this.user_date);
  });
  /** "Starts in 3 hours" or "Started 20 minutes ago". */
  public readonly note = computed(() => {
    const game = this.game();
    return game === null
      ? ''
      : format_next_up_note(
          game,
          this.now(),
          (key, params) => this.t(key, params),
          this.resolve_locale(),
        );
  });
  public readonly is_in_progress = computed(() => {
    const game = this.game();
    return game !== null && get_next_up_timing(game, this.now()) === NextUpTiming.IN_PROGRESS;
  });
  /** The location to name when the venue line does not already say it. */
  public readonly location_text = computed<string | null>(() => {
    const game = this.game();
    if (game === null) return null;
    const location = format_location_label(game.location_group, (key) => this.t(key));
    return location === game.venue_name ? null : location;
  });
  public readonly position_label = computed(() => {
    const position = this.game()?.my_position;
    return position
      ? this.t('Your position: {{position}}', { position })
      : this.t('You are assigned');
  });
  /** Level, league and age group, whichever the game has. */
  public readonly tags = computed<string[]>(() => {
    const game = this.game();
    if (game === null) return [];
    return [game.age_group, game.level, game.league].filter((tag): tag is string =>
      Boolean(tag?.trim()),
    );
  });

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
