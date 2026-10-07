/**
 * Builds the absolute address a link's recipient opens.
 * @param origin The app's origin, e.g. `https://app.example.com`.
 * @param path The path the API returned, `/q/<token>`.
 * @returns The absolute URL.
 */
export function build_quick_link_url(origin: string, path: string): string {
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}
