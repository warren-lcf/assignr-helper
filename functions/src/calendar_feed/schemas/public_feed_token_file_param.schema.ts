import { z } from 'zod';

/**
 * The last segment of a public calendar feed URL: exactly what the library makes (43 base64url
 * characters, 32 random bytes) followed by `.ics`. Anything else is rejected before any lookup,
 * so garbage never reaches the database.
 */
export const public_feed_token_file_param_schema = z.strictObject({
  token_file: z.string().regex(/^[A-Za-z0-9_-]{43}\.ics$/),
});
