import { z } from 'zod';

/**
 * The token in a public quick-link URL: exactly what `generate_quick_link_token` makes, 43
 * base64url characters (32 random bytes). Anything else is rejected before any lookup, so
 * garbage never reaches the database.
 */
export const public_quick_link_token_param_schema = z.strictObject({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
