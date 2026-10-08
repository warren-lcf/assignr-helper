import { z } from 'zod';
import { parse_email_address } from '../../domain/email/parse_email_address.js';

/**
 * A request field holding one email address. It is trimmed, lower-cased and validated strictly
 * (see `parse_email_address`): display names, quotes, spaces, commas and control characters such
 * as CR and LF are all refused, so the value can be used in a mail header or API call as is.
 * The address is personal data, so the field is marked PII.
 */
export const email_address_schema = z
  .string({ error: 'Must be an email address' })
  .max(320, 'Must be at most 320 characters')
  .transform((value, ctx): string => {
    const parsed = parse_email_address(value);
    if (parsed === null) {
      ctx.issues.push({ code: 'custom', message: 'Must be a valid email address', input: value });
      return z.NEVER;
    }
    return parsed;
  })
  .meta({ pii: true });
