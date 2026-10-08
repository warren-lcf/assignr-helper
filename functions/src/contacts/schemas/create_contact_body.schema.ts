import { z } from 'zod';
import { email_address_schema } from '../../http/schemas/email_address.schema.js';
import { single_line_text_schema } from '../../http/schemas/single_line_text.schema.js';
import { CONTACT_LIMITS } from '../contact_limits.constant.js';

/**
 * Body of `POST /api/contacts`. The owner must attest, with a literal `true`, that the person
 * agreed to receive these emails; anything else (missing, false, "true") is refused. Unknown
 * fields are rejected.
 */
export const create_contact_body_schema = z.strictObject({
  display_name: single_line_text_schema(CONTACT_LIMITS.MAX_DISPLAY_NAME_LENGTH),
  email_address: email_address_schema,
  consent_attested: z.literal(true, {
    error: 'Must be true: confirm the person agreed to receive these emails',
  }),
});

/** A validated `POST /api/contacts` body. */
export type ICreateContactBody = z.infer<typeof create_contact_body_schema>;
