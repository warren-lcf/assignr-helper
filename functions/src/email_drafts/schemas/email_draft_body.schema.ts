import { z } from 'zod';
import { has_control_characters } from '../../domain/text/has_control_characters.js';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';
import {
  optional_single_line_text_schema,
  single_line_text_schema,
} from '../../http/schemas/single_line_text.schema.js';
import { EMAIL_DRAFT_LIMITS } from '../email_draft_limits.constant.js';
import { RecipientMode } from '../enums/recipient_mode.enum.js';
import { IDraftContent } from '../models/draft_content.model.js';

/** An instant given as whole UTC milliseconds. */
const filter_date = z
  .number({ error: 'Must be a number of UTC milliseconds' })
  .int('Must be a whole number of UTC milliseconds')
  .min(0, 'Must not be negative')
  .max(EMAIL_DRAFT_LIMITS.MAX_FILTER_DATE, 'Must be before the year 2200')
  .nullable();

/** An optional id filter: an id, null, or omitted. */
const optional_id = resource_id_schema.nullable().optional();

/** The intro paragraph: free text that may span lines, with no other control characters. */
const intro_field = z
  .string({ error: 'Must be text' })
  .trim()
  .max(
    EMAIL_DRAFT_LIMITS.MAX_INTRO_LENGTH,
    `Must be at most ${EMAIL_DRAFT_LIMITS.MAX_INTRO_LENGTH} characters`,
  )
  .refine((value) => !has_control_characters(value, true), {
    error: 'Must not contain control characters',
  })
  .nullable()
  .transform((value) => (value === null || value === '' ? null : value));

/** The `filters` object: every field optional, unknown fields rejected. */
const filters_schema = z.strictObject({
  search: optional_single_line_text_schema(EMAIL_DRAFT_LIMITS.MAX_SEARCH_LENGTH).optional(),
  level: optional_single_line_text_schema(EMAIL_DRAFT_LIMITS.MAX_LEVEL_LENGTH).optional(),
  league: optional_single_line_text_schema(EMAIL_DRAFT_LIMITS.MAX_LONG_FILTER_LENGTH).optional(),
  age_group: optional_single_line_text_schema(EMAIL_DRAFT_LIMITS.MAX_AGE_GROUP_LENGTH).optional(),
  location_group: optional_single_line_text_schema(
    EMAIL_DRAFT_LIMITS.MAX_LONG_FILTER_LENGTH,
  ).optional(),
  organization_id: optional_id,
  connection_id: optional_id,
  only_with_open_slots: z.boolean({ error: 'Must be true or false' }).optional(),
  date_from: filter_date.optional(),
  date_to: filter_date.optional(),
});

/**
 * Body of `POST /api/email_drafts` and `PUT /api/email_drafts/:draft_id`. The subject is one line
 * with no control characters (so no CR or LF can reach a header). `contact_ids` belongs to the
 * SELECTED mode only. Unknown fields are rejected. Whether the named contacts exist is checked by
 * the service, which knows the tenant.
 */
export const email_draft_body_schema = z
  .strictObject({
    subject: single_line_text_schema(EMAIL_DRAFT_LIMITS.MAX_SUBJECT_LENGTH),
    intro: intro_field.optional(),
    filters: filters_schema,
    include_quick_link: z.boolean({ error: 'Must be true or false' }),
    quick_link_expiry_days: z
      .number({ error: 'Must be a whole number of days' })
      .int('Must be a whole number of days')
      .min(
        EMAIL_DRAFT_LIMITS.MIN_EXPIRY_DAYS,
        `Must be at least ${EMAIL_DRAFT_LIMITS.MIN_EXPIRY_DAYS}`,
      )
      .max(
        EMAIL_DRAFT_LIMITS.MAX_EXPIRY_DAYS,
        `Must be at most ${EMAIL_DRAFT_LIMITS.MAX_EXPIRY_DAYS}`,
      )
      .default(EMAIL_DRAFT_LIMITS.DEFAULT_EXPIRY_DAYS),
    recipient_mode: z.enum(RecipientMode, { error: 'Must be ALL_CONSENTED or SELECTED' }),
    contact_ids: z
      .array(resource_id_schema)
      .max(
        EMAIL_DRAFT_LIMITS.MAX_CONTACT_IDS,
        `Must have at most ${EMAIL_DRAFT_LIMITS.MAX_CONTACT_IDS} contacts`,
      )
      .optional(),
  })
  .transform((value, ctx): IDraftContent => {
    const date_from = value.filters.date_from ?? null;
    const date_to = value.filters.date_to ?? null;
    if (date_from !== null && date_to !== null) {
      if (date_to < date_from) {
        ctx.issues.push({
          code: 'custom',
          message: 'Must not be before date_from',
          path: ['filters', 'date_to'],
          input: value.filters.date_to,
        });
        return z.NEVER;
      }
      if (date_to - date_from > EMAIL_DRAFT_LIMITS.MAX_WINDOW_MS) {
        ctx.issues.push({
          code: 'custom',
          message: 'The window may span at most 400 days',
          path: ['filters', 'date_to'],
          input: value.filters.date_to,
        });
        return z.NEVER;
      }
    }
    const contact_ids = [...new Set(value.contact_ids ?? [])];
    if (value.recipient_mode === RecipientMode.ALL_CONSENTED && contact_ids.length > 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'Only allowed when recipient_mode is SELECTED',
        path: ['contact_ids'],
        input: value.contact_ids,
      });
      return z.NEVER;
    }
    return {
      subject: value.subject,
      intro: value.intro ?? null,
      filters: {
        search: value.filters.search ?? null,
        level: value.filters.level ?? null,
        league: value.filters.league ?? null,
        age_group: value.filters.age_group ?? null,
        location_group: value.filters.location_group ?? null,
        organization_id: value.filters.organization_id ?? null,
        connection_id: value.filters.connection_id ?? null,
        only_with_open_slots: value.filters.only_with_open_slots ?? false,
        date_from,
        date_to,
      },
      include_quick_link: value.include_quick_link,
      quick_link_expiry_days: value.quick_link_expiry_days,
      recipient_mode: value.recipient_mode,
      contact_ids,
    };
  });
