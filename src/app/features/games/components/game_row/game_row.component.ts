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
import { format_open_slots } from '../../utils/format_open_slots';

/**
 * One game in the agenda: kick-off time, the teams, venue and organization,
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
   * Kick-off is rendered in the viewer's own time zone. The venue's local time is what a referee
   * needs, but `hchUserDate` has no per-call time zone yet (upstream issue #996).
   */
  public readonly time_format = UserDateFormat.TIME_ONLY;
  public readonly tone = StatusToneEnum;

  public readonly is_cancelled = computed(() => this.game().status === GameStatus.CANCELLED);
  public readonly title = computed(() =>
    format_game_title(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly slots_text = computed(() =>
    format_open_slots(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly has_open_slots = computed(() => this.game().open_slot_count > 0);
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
