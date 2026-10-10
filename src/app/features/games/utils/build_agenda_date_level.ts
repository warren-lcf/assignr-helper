import { UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { IAgendaGroupLevel } from '@hch-shared-libraries/ui-kit/data/grouped_agenda_list';
import { IGameView } from '../models/game_view.model';
import { format_agenda_date_heading } from './format_agenda_date_heading';
import { get_agenda_date_key } from './get_agenda_date_key';

/**
 * The agenda level that groups games by calendar date: keyed by the date's UTC-midnight milliseconds
 * (so the same day a year apart is two groups) and headed by the weekday and date ("Saturday, Oct
 * 10"). The Games screen without venue grouping and My Schedule both group this way.
 * @param translate Translates an English key.
 * @param user_date The ui-kit date formatter.
 * @returns The group level.
 */
export function build_agenda_date_level(
  translate: (key: string) => string,
  user_date: Pick<UserDatePipe, 'transform'>,
): IAgendaGroupLevel<IGameView> {
  return {
    get_key: (game) => get_agenda_date_key(game.local_date),
    get_label: (_key, game) => format_agenda_date_heading(game.local_date, translate, user_date),
  };
}
