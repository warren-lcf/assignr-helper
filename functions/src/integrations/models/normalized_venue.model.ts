/** A playing location, normalized across providers. */
export interface INormalizedVenue {
  external_id: string;
  name: string;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  /** IANA time zone of the venue, e.g. `America/New_York`. */
  time_zone: string | null;
}
