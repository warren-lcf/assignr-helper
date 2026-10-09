import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  StatusChipComponent,
  StatusToneEnum,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GameStatus } from '../../enums/game_status.enum';
import { IGameView } from '../../models/game_view.model';
import { format_game_title } from '../../utils/format_game_title';
import { build_slot_chips } from '../../utils/build_slot_chips';
import { format_location_label } from '../../utils/format_location_label';
import { format_open_slots } from '../../utils/format_open_slots';

/**
 * The content of one game in the agenda: kick-off time (unless the list draws it), the teams, venue and organization,
 * level/league/age-group/type tags, how many slots are still open, whether the
 * viewer is assigned (with their position) and whether the game is cancelled.
 * Every status is an icon plus text, never colour alone. Read-only: it emits nothing.
 */
@Component({
  selector: 'app-game-row',
  standalone: true,
  imports: [MatIconModule, StatusChipComponent, UserDatePipe],
  templateUrl: './game_row.component.html',
  styleUrl: './game_row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GameRowComponent {
  private readonly translation = inject(AppTranslationService);

  /** The game to show. */
  public readonly game = input.required<IGameView>();
  /**
   * True when no location heading sits above the game (the list is not grouped by venue), so the
   * row names where it is played.
   */
  public readonly show_location = input(false);
  /**
   * False when the list the row sits in draws the kick-off time in a column of its own (the grouped
   * agenda list does), so the row does not repeat it.
   */
  public readonly show_time = input(true);

  /**
   * Kick-off is shown on the venue's own clock with its zone ("10:00 AM CDT"); when the zone is not
   * known the pipe falls back to the viewer's zone, and the abbreviation says which clock it is.
   */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;
  public readonly tone = StatusToneEnum;

  /** The location to name on the row, or null when it is not wanted or the venue line already says it. */
  public readonly location_text = computed<string | null>(() => {
    if (!this.show_location()) return null;
    const location = format_location_label(this.game().location_group, (key) => this.t(key));
    return location === this.game().venue_name ? null : location;
  });

  public readonly is_cancelled = computed(() => this.game().status === GameStatus.CANCELLED);
  public readonly title = computed(() =>
    format_game_title(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly slots_text = computed(() =>
    format_open_slots(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly has_open_slots = computed(() => this.game().open_slot_count > 0);
  /** One chip per position, open ones first, naming the position and its state. */
  public readonly slot_chips = computed(() =>
    build_slot_chips(this.game().slots, (key, params) => this.t(key, params)),
  );
  /** Level, league, age group, gender and game type, whichever the game has, as plain tags. */
  public readonly tags = computed<string[]>(() => {
    const game = this.game();
    return [game.age_group, game.gender, game.level, game.league, game.game_type].filter(
      (tag): tag is string => Boolean(tag?.trim()),
    );
  });
  public readonly mine_label = computed(() => {
    const position = this.game().my_position;
    return position ? this.t('Mine: {{position}}', { position }) : this.t('Mine');
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
