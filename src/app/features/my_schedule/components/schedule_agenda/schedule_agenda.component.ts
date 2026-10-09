import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { UserDateFormat, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import {
  GroupedAgendaListComponent,
  IAgendaGroupLevel,
  IAgendaItemNoun,
} from '@hch-shared-libraries/ui-kit/data/grouped_agenda_list';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { GameRowComponent } from '../../../games/components/game_row/game_row.component';
import { IGameView } from '../../../games/models/game_view.model';
import { build_agenda_date_level } from '../../../games/utils/build_agenda_date_level';

/**
 * The referee's upcoming games as one ui-kit grouped agenda list, grouped by calendar date. The
 * kick-off time sits in the list's own time column, on the venue's clock with its zone, and each row
 * (the Games screen's own) names the teams, where the game is, the referee's position and the
 * level and league. Read-only; a group collapses from its header (the list keeps which ones).
 */
@Component({
  selector: 'app-schedule-agenda',
  standalone: true,
  imports: [GroupedAgendaListComponent, GameRowComponent, UserDatePipe],
  providers: [UserDatePipe],
  templateUrl: './schedule_agenda.component.html',
  styleUrl: './schedule_agenda.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScheduleAgendaComponent {
  private readonly translation = inject(AppTranslationService);
  private readonly user_date = inject(UserDatePipe);

  /** The games to list, in date then start-time order. */
  public readonly games = input.required<readonly IGameView[]>();

  /** One level: the calendar date, headed by its weekday. Labels read the translation signals. */
  public readonly group_levels = computed<IAgendaGroupLevel<IGameView>[]>(() => [
    build_agenda_date_level((key) => this.t(key), this.user_date),
  ]);
  /** What one row is called, for the group count chips ("3 games"). */
  public readonly item_noun = computed<IAgendaItemNoun>(() => ({
    one: this.t('game'),
    other: this.t('games'),
  }));
  /** Kick-off is shown on the venue's own clock with its zone; without a known zone it is the viewer's. */
  public readonly time_format = UserDateFormat.TIME_ONLY_WITH_ZONE;

  /**
   * Identifies a game so its row keeps its DOM when the same game arrives in a new result.
   * @param game The game.
   * @returns The game's id.
   */
  public readonly get_game_key = (game: IGameView): string => game.game_id;

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @returns The translated text.
   */
  public t(key: string): string {
    return this.translation.translate(key);
  }
}
