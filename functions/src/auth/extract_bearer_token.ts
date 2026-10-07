const BEARER_PATTERN = /^bearer\s+(\S+)$/i;

/**
 * Reads the token from an `Authorization: Bearer <token>` header.
 * @param header_value Raw header value.
 * @returns The token, or null when the header is missing or not a single bearer token.
 */
export function extract_bearer_token(header_value: string | string[] | undefined): string | null {
  if (typeof header_value !== 'string') return null;
  const match = BEARER_PATTERN.exec(header_value.trim());
  return match ? match[1] : null;
}
