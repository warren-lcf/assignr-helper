/** Prefix that binds every unsubscribe HMAC to this purpose, so the key cannot sign anything else. */
export const UNSUBSCRIBE_MAC_CONTEXT = 'hch-assignr-helper/unsubscribe/v1\0';

/** Length of an HMAC-SHA256 tag in bytes. */
export const UNSUBSCRIBE_MAC_LENGTH = 32;

/** An id inside a token: the same alphabet the API accepts for tenant and contact ids. */
export const UNSUBSCRIBE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Longest well-formed token in characters, so garbage is rejected before any decoding. */
export const UNSUBSCRIBE_TOKEN_MAX_LENGTH = 256;

/** Shortest well-formed token in characters (one version byte, two one-character ids, a colon, the MAC). */
export const UNSUBSCRIBE_TOKEN_MIN_LENGTH = 48;
