import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  StatusChipComponent,
  StatusToneEnum,
  UserDateFormat,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { build_slot_chips } from '../../../games/utils/build_slot_chips';
import { format_game_title } from '../../../games/utils/format_game_title';
import { IPublicGame } from '../../models/public_game.model';
import { format_open_spots } from '../../utils/format_open_spots';
import { to_game_slot_views } from '../../utils/to_game_slot_views';

/**
 * One game on the public page: kick-off time, the teams (or "Teams to be
 * announced"), the venue, level and league tags, and how many referee spots
 * are open as an icon plus text, never colour alone. Fees and organization
 * names are not part of the data and never shown. Read-only.
 */
@Component({
  selector: 'app-public-game-row',
  standalone: true,
  imports: [MatIconModule, StatusChipComponent, UserDatePipe],
  templateUrl: './public_game_row.component.html',
  styleUrl: './public_game_row.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PublicGameRowComponent {
  private readonly translation = inject(AppTranslationService);

  /** The game to show. */
  public readonly game = input.required<IPublicGame>();

  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the visitor's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;
  public readonly tone = StatusToneEnum;

  public readonly title = computed(() =>
    format_game_title(this.game(), (key, params) => this.t(key, params)),
  );
  public readonly spots_text = computed(() =>
    format_open_spots(this.game().open_slot_count, (key, params) => this.t(key, params)),
  );
  public readonly has_open_spots = computed(() => this.game().open_slot_count > 0);
  /** One chip per position, open ones first, naming the position and whether it is open. */
  public readonly slot_chips = computed(() =>
    build_slot_chips(to_game_slot_views(this.game().slots), (key, params) => this.t(key, params)),
  );
  /** Level and league, whichever the game has, as plain tags. */
  public readonly tags = computed<string[]>(() =>
    [this.game().level, this.game().league].filter((tag): tag is string => Boolean(tag?.trim())),
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
