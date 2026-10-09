import { IPublicGame } from './public_game.model';

/**
 * One game as a row of the public agenda list, with the location and date the server grouped it
 * under. The game's own `location_group` can be empty while the server still named the group
 * (after its venue, or the placeholder), so the group's values travel with the row.
 */
export interface IPublicAgendaRow {
  /** The game. */
  game: IPublicGame;
  /** The server's label of the location group the game sits in. */
  location_label: string;
  /** UTC-midnight milliseconds of the date group the game sits in; null when the date is unknown. */
  local_date: number | null;
}
