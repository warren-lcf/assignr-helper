import { INormalizedVenue } from '../../models/normalized_venue.model.js';
import { assignr_venue_schema } from '../schemas/assignr_venue.schema.js';
import { z } from 'zod';

type AssignrVenuePayload = z.infer<typeof assignr_venue_schema>;

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
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    time_zone: to_text(payload.timezone),
  };
}
