/** The scheme part of an http or https address. */
const HTTP_SCHEME = /^https?:\/\//i;

/**
 * The `webcal://` form of a feed address, which asks the device to open its calendar app and
 * subscribe. Only the scheme changes.
 * @param feed_url The absolute http(s) address of the feed.
 * @returns The webcal address, or null when the address is not an http(s) one.
 */
export function build_webcal_url(feed_url: string): string | null {
  return HTTP_SCHEME.test(feed_url) ? feed_url.replace(HTTP_SCHEME, 'webcal://') : null;
}
