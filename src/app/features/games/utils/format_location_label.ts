import { LOCATION_TO_BE_ANNOUNCED } from '../constants/games_limits.constant';

/**
 * The location as shown. Only the backend's English placeholder for an
 * unknown location is translated; every other label is a real place name and
 * must render as given (translating it could match an unrelated dictionary key).
 * @param label The location label from the backend.
 * @param translate Translates an English key.
 * @returns The text to show.
 */
export function format_location_label(label: string, translate: (key: string) => string): string {
  return label === LOCATION_TO_BE_ANNOUNCED ? translate(label) : label;
}
