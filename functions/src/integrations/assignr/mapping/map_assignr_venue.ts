import { INormalizedVenue } from '../../models/normalized_venue.model.js';
import { assignr_venue_schema } from '../schemas/assignr_venue.schema.js';
import { z } from 'zod';

type AssignrVenuePayload = z.infer<typeof assignr_venue_schema>;

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

/**
 * Converts text or number fields to a trimmed string.
 * @param value Field value from the payload.
 * @returns A non-empty string, or null.
 */
function to_text(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

/**
 * Converts a text or number coordinate to a number inside its valid range.
 * @param value Field value from the payload.
 * @param limit Largest allowed absolute value (90 for latitude, 180 for longitude).
 * @returns The coordinate, or null when missing, blank, not numeric or out of range.
 */
function to_coordinate(value: string | number | null | undefined, limit: number): number | null {
  const text = to_text(value);
  if (text === null) return null;
  const coordinate = Number(text);
  return Number.isFinite(coordinate) && Math.abs(coordinate) <= limit ? coordinate : null;
}

/**
 * Maps an Assignr venue payload to the normalized venue.
 * @param payload Parsed venue payload.
 * @returns The normalized venue.
 */
export function map_assignr_venue(payload: AssignrVenuePayload): INormalizedVenue {
  return {
    external_id: payload.id,
    name: payload.name.trim(),
    address_line: to_text(payload.address ?? payload.address1),
    city: to_text(payload.city),
    region: to_text(payload.state),
    postal_code: to_text(payload.zip ?? payload.postal_code),
    latitude: to_coordinate(payload.latitude, MAX_LATITUDE),
    longitude: to_coordinate(payload.longitude, MAX_LONGITUDE),
    time_zone: to_text(payload.timezone),
  };
}
