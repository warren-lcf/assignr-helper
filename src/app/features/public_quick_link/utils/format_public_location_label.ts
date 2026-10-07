import { PUBLIC_LOCATION_TO_BE_ANNOUNCED } from '../constants/public_quick_link.constant';

/**
 * The location as shown. Only the server placeholder for an unknown location
 * is translated; every other label is a real place name and must render as
 * given.
 * @param label The location label from the server.
 * @param translate Translates an English key.
 * @returns The text to show.
 */
export function format_public_location_label(
  label: string,
  translate: (key: string) => string,
): string {
  return label === PUBLIC_LOCATION_TO_BE_ANNOUNCED ? translate(label) : label;
}
