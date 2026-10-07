/**
 * Validates a URL destined for an email `href` or a plain-text link.
 * Only absolute `https:` URLs without embedded credentials are accepted, which
 * rejects `javascript:`, `data:`, `http:`, relative and malformed values.
 * @param url Candidate URL, or null.
 * @returns The normalised URL string, or null when it must not be linked.
 */
export function safe_https_url(url: string | null): string | null {
  if (url === null) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') {
    return null;
  }
  return parsed.href;
}
