/**
 * Builds the absolute address a calendar app subscribes to.
 * @param origin The app's origin, e.g. `https://app.example.com`.
 * @param path The path the API returned, `/api/public/cal/<token>.ics`.
 * @returns The absolute URL.
 */
export function build_feed_url(origin: string, path: string): string {
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
