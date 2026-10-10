import type { CalendarEvent } from '@hch-shared-libraries/core-server';
import { IStoredGame } from '../../sync/models/stored_game.model.js';
import { IStoredOrganization } from '../../sync/models/stored_organization.model.js';
import { IStoredVenue } from '../../sync/models/stored_venue.model.js';
import { CALENDAR_EVENT_LIMITS } from './calendar_event_limits.constant.js';
import { clean_calendar_text } from './clean_calendar_text.js';

/** Fallback title when the teams are not both known. */
const UNKNOWN_GAME_TITLE = 'Game';

/**
 * Lists the positions the connected account holds in a game, in game order and without repeats.
 * @param game Stored game with its slots.
 * @returns Cleaned position names; empty when the account holds none.
 */
function my_positions_of(game: IStoredGame): string[] {
  const positions: string[] = [];
  for (const slot of game.slots) {
    if (!slot.is_mine) continue;
    const position = clean_calendar_text(
      slot.position,
      CALENDAR_EVENT_LIMITS.MAX_TITLE_PART_LENGTH,
    );
    if (position !== null && !positions.includes(position)) {
      positions.push(position);
    }
  }
  return positions;
}

/**
 * Builds the event title: "Home vs Away (Position)", falling back to "Game (Position)" or
 * "Game" when the teams or the position are not known.
 * @param game Stored game.
 * @param positions The account's positions, cleaned.
 * @returns A single-line title no longer than the title limit.
 */
function title_of(game: IStoredGame, positions: string[]): string {
  const home = clean_calendar_text(game.home_team, CALENDAR_EVENT_LIMITS.MAX_TITLE_PART_LENGTH);
  const away = clean_calendar_text(game.away_team, CALENDAR_EVENT_LIMITS.MAX_TITLE_PART_LENGTH);
  const teams = home !== null && away !== null ? `${home} vs ${away}` : UNKNOWN_GAME_TITLE;
  const title = positions.length > 0 ? `${teams} (${positions.join(', ')})` : teams;
  return clean_calendar_text(title, CALENDAR_EVENT_LIMITS.MAX_TITLE_LENGTH) ?? UNKNOWN_GAME_TITLE;
}

/**
 * Builds the location line: the venue name followed by the address parts that exist.
 * @param venue The game's venue, or null.
 * @returns The location, or null when there is no venue or nothing usable on it.
 */
function location_of(venue: IStoredVenue | null): string | null {
  if (venue === null) return null;
  const parts = [venue.name, venue.address_line, venue.city, venue.region, venue.postal_code]
    .map((part) => clean_calendar_text(part, CALENDAR_EVENT_LIMITS.MAX_LOCATION_LENGTH))
    .filter((part): part is string => part !== null);
  return clean_calendar_text(parts.join(', '), CALENDAR_EVENT_LIMITS.MAX_LOCATION_LENGTH);
}

/**
 * Builds the description: only the lines whose value exists, then a link back to the app.
 * Nothing about other officials, fees or the provider is ever written here.
 * @param game Stored game.
 * @param positions The account's positions, cleaned.
 * @param organization The game's organization, or null.
 * @param public_app_origin The app's https origin, with or without a trailing slash.
 * @returns The description lines joined with line feeds.
 */
function description_of(
  game: IStoredGame,
  positions: string[],
  organization: IStoredOrganization | null,
  public_app_origin: string,
): string {
  const value = (text: string | null | undefined): string | null =>
    clean_calendar_text(text, CALENDAR_EVENT_LIMITS.MAX_DESCRIPTION_VALUE_LENGTH);
  const labelled: [string, string | null][] = [
    ['Position', value(positions.join(', '))],
    ['Level', value(game.level)],
    ['League', value(game.league)],
    ['Age group', value(game.age_group)],
    ['Assignor', value(organization?.name)],
  ];
  const lines = labelled
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([label, text]) => `${label}: ${text}`);
  lines.push(`Open in Assignr Helper: ${public_app_origin.replace(/\/+$/u, '')}/games`);
  return lines.join('\n');
}

/**
 * Turns a stored game into one calendar event. The event id is stable (`game-<game_id>`), so a
 * calendar client updates the same entry on every refresh. The game's end is used when it is
 * after the start, otherwise the game is given the default length. Only fields safe to hand to a
 * calendar client are used: never assignee names, fees, provider ids or the raw payload.
 * @param game Stored game with its slots.
 * @param venue The game's venue, or null when it has none or it is unknown.
 * @param organization The game's organization (the assignor), or null when unknown.
 * @param public_app_origin The app's https origin, used for the link in the description.
 * @returns The event.
 */
export function to_calendar_event(
  game: IStoredGame,
  venue: IStoredVenue | null,
  organization: IStoredOrganization | null,
  public_app_origin: string,
): CalendarEvent {
  const positions = my_positions_of(game);
  const end_at = game.end_at !== null && game.end_at > game.start_at ? game.end_at : null;
  return {
    event_id: `game-${game.game_id.replace(/[^A-Za-z0-9_-]/gu, '_')}`,
    title: title_of(game, positions),
    start_utc_ms: game.start_at,
    end_utc_ms: end_at ?? game.start_at + CALENDAR_EVENT_LIMITS.DEFAULT_DURATION_MS,
    is_all_day: false,
    location: location_of(venue),
    description: description_of(game, positions, organization, public_app_origin),
    recurrence_rule: null,
  };
}
