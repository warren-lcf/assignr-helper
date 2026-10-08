import { z } from 'zod';
import { CONTACT_LIMITS } from '../contact_limits.constant.js';

/**
 * One imported row as sent. Cells are only checked for type and size here: whether an address or
 * a name is acceptable is decided row by row, so one bad row is reported without refusing the rest.
 */
const import_entry_schema = z.strictObject({
  display_name: z.string().max(CONTACT_LIMITS.MAX_IMPORT_CELL_LENGTH).nullable().optional(),
  email_address: z
    .string({ error: 'Must be text' })
    .max(CONTACT_LIMITS.MAX_IMPORT_CELL_LENGTH)
    .meta({ pii: true }),
});

/**
 * Body of `POST /api/contacts/import`: 1 to 200 entries, and the owner's attestation (a literal
 * `true`) that every person listed agreed to receive these emails. Unknown fields are rejected.
 */
export const import_contacts_body_schema = z.strictObject({
  entries: z
    .array(import_entry_schema)
    .min(1, 'Must have at least one entry')
    .max(
      CONTACT_LIMITS.MAX_IMPORT_ENTRIES,
      `Must have at most ${CONTACT_LIMITS.MAX_IMPORT_ENTRIES} entries`,
    ),
  consent_attested: z.literal(true, {
    error: 'Must be true: confirm every person listed agreed to receive these emails',
  }),
});

/** A validated `POST /api/contacts/import` body. */
export type IImportContactsBody = z.infer<typeof import_contacts_body_schema>;
