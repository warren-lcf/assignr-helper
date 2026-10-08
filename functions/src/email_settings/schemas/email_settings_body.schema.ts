import { z } from 'zod';
import { has_control_characters } from '../../domain/text/has_control_characters.js';
import { email_address_schema } from '../../http/schemas/email_address.schema.js';
import { optional_single_line_text_schema } from '../../http/schemas/single_line_text.schema.js';
import { EMAIL_SETTINGS_LIMITS } from '../email_settings_limits.constant.js';

/**
 * A SendGrid API key as pasted: printable ASCII with no spaces, so it can sit in an
 * `Authorization` header and can never carry a line break.
 */
const api_key_field = z
  .string({ error: 'Must be text' })
  .trim()
  .min(1, 'Must not be blank')
  .max(
    EMAIL_SETTINGS_LIMITS.MAX_API_KEY_LENGTH,
    `Must be at most ${EMAIL_SETTINGS_LIMITS.MAX_API_KEY_LENGTH} characters`,
  )
  .regex(/^[\x21-\x7e]+$/, 'Must be printable characters without spaces');

/** The postal address printed in every email footer: trimmed, may span lines, no other control characters. */
const postal_address_field = z
  .string({ error: 'Must be text' })
  .trim()
  .max(
    EMAIL_SETTINGS_LIMITS.MAX_POSTAL_ADDRESS_LENGTH,
    `Must be at most ${EMAIL_SETTINGS_LIMITS.MAX_POSTAL_ADDRESS_LENGTH} characters`,
  )
  .refine((value) => !has_control_characters(value, true), {
    error: 'Must not contain control characters',
  })
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value));

/**
 * Body of `PUT /api/email/settings`. `api_key` is optional once email is configured (omitted
 * keeps the stored key). The other fields describe the whole non-secret configuration: an
 * omitted optional field is cleared. Unknown fields are rejected.
 */
export const email_settings_body_schema = z.strictObject({
  api_key: api_key_field.optional(),
  from_email: email_address_schema,
  from_name: optional_single_line_text_schema(
    EMAIL_SETTINGS_LIMITS.MAX_FROM_NAME_LENGTH,
  ).optional(),
  reply_to: email_address_schema.nullable().optional(),
  postal_address: postal_address_field.optional(),
});

/** A validated `PUT /api/email/settings` body. */
export type IEmailSettingsBody = z.infer<typeof email_settings_body_schema>;
