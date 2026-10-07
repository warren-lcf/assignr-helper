/**
 * How many reverse proxies are trusted to report the caller's address when none is configured:
 * Firebase Hosting's edge and the Google front end that hands the request to the function. The
 * client's address is then the second entry from the right of `X-Forwarded-For`; anything a
 * client writes further left is ignored. Verify this against a deployed request: a count that is
 * too low makes every visitor share one rate-limit bucket (the proxy's address), and one that is
 * too high lets a client who calls the function directly choose its own address.
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 2;

/** Most proxies the setting may name. */
const MAX_TRUSTED_PROXY_HOPS = 5;

/**
 * Reads `TRUSTED_PROXY_HOPS`, the number of reverse proxies in front of the function.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The configured hop count, or the default when the variable is unset or blank.
 * @throws When the variable is set to anything but a whole number from 0 to 5, so a typo stops
 *   the start-up instead of quietly disabling or misdirecting rate limiting.
 */
export function read_trusted_proxy_hops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env['TRUSTED_PROXY_HOPS']?.trim();
  if (raw === undefined || raw === '') {
    return DEFAULT_TRUSTED_PROXY_HOPS;
  }
  if (!/^\d$/.test(raw) || Number(raw) > MAX_TRUSTED_PROXY_HOPS) {
    throw new Error(
      `Environment variable TRUSTED_PROXY_HOPS must be a whole number from 0 to ${MAX_TRUSTED_PROXY_HOPS}`,
    );
  }
  return Number(raw);
}
