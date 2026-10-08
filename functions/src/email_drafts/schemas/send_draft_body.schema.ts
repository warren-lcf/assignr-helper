import { z } from 'zod';

/**
 * Body of `POST /api/email_drafts/:draft_id/send`: the recipient count the owner saw and agreed
 * to. The server recomputes the count and refuses the send when it differs.
 */
export const send_draft_body_schema = z.strictObject({
  confirm_recipient_count: z
    .number({ error: 'Must be a whole number' })
    .int('Must be a whole number')
    .min(0, 'Must not be negative')
    .max(1_000_000, 'Must be a plausible recipient count'),
});
