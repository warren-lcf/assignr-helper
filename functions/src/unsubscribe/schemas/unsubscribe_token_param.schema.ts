import { z } from 'zod';
import {
  UNSUBSCRIBE_TOKEN_MAX_LENGTH,
  UNSUBSCRIBE_TOKEN_MIN_LENGTH,
} from '../../domain/unsubscribe/unsubscribe_token_constants.js';

/**
 * The token in a public unsubscribe URL: base64url text of a plausible length. Anything else is
 * rejected before any lookup, so garbage never reaches the key store or the database.
 */
export const unsubscribe_token_param_schema = z.strictObject({
  token: z
    .string()
    .min(UNSUBSCRIBE_TOKEN_MIN_LENGTH)
    .max(UNSUBSCRIBE_TOKEN_MAX_LENGTH)
    .regex(/^[A-Za-z0-9_-]+$/),
});
