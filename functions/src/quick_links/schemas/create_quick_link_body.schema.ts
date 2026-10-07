import { z } from 'zod';
import { QUICK_LINK_LIMITS } from '../quick_link_limits.constant.js';
import { ICreateQuickLinkInput } from '../models/create_quick_link_input.model.js';

/** An organization id: letters, digits, `-` and `_` only. */
const organization_id = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Must be 1 to 64 letters, digits, - or _');

/** A level name as the provider spells it, without surrounding whitespace. */
const level = z
  .string()
  .trim()
  .min(1, 'Must not be blank')
  .max(
    QUICK_LINK_LIMITS.MAX_LEVEL_LENGTH,
    `Must be at most ${QUICK_LINK_LIMITS.MAX_LEVEL_LENGTH} characters`,
  );

/** A calendar date as UTC-midnight milliseconds. */
const scope_date = z
  .number({ error: 'Must be a number of UTC milliseconds' })
  .int('Must be a whole number of UTC milliseconds')
  .min(0, 'Must not be negative')
  .max(QUICK_LINK_LIMITS.MAX_SCOPE_DATE, 'Must be before the year 2200')
  .refine((value) => value % QUICK_LINK_LIMITS.MS_PER_DAY === 0, {
    error: 'Must be midnight UTC',
  })
  .nullable();

/**
 * Removes repeated items, keeping the first of each and the original order.
 * @param items Items that may repeat.
 * @returns The items without repeats.
 */
function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/**
 * Builds the schema of `POST /api/quick_links`. Every field is optional: an omitted scope list
 * or date means "no restriction", and an omitted or null `expires_at` means the link never
 * expires. Unknown fields are rejected. A date window may not be reversed, and an expiry must
 * be in the future and at most 400 days ahead, judged by the clock at parse time.
 * @param now Clock returning the current instant in UTC milliseconds.
 * @returns A schema that turns a request body into a resolved create input.
 */
export function create_quick_link_body_schema(now: () => number) {
  return z
    .strictObject({
      scope: z
        .strictObject({
          organization_ids: z
            .array(organization_id)
            .max(QUICK_LINK_LIMITS.MAX_ORGANIZATION_IDS)
            .optional(),
          levels: z.array(level).max(QUICK_LINK_LIMITS.MAX_LEVELS).optional(),
          date_start: scope_date.optional(),
          date_end: scope_date.optional(),
        })
        .optional(),
      expires_at: z
        .number({ error: 'Must be a number of UTC milliseconds' })
        .int('Must be a whole number of UTC milliseconds')
        .nullable()
        .optional(),
    })
    .transform((value, ctx): ICreateQuickLinkInput => {
      const date_start = value.scope?.date_start ?? null;
      const date_end = value.scope?.date_end ?? null;
      if (date_start !== null && date_end !== null && date_end < date_start) {
        ctx.issues.push({
          code: 'custom',
          message: 'Must not be before date_start',
          path: ['scope', 'date_end'],
          input: value.scope?.date_end,
        });
        return z.NEVER;
      }
      const expires_at = value.expires_at ?? null;
      if (expires_at !== null) {
        const current = now();
        if (expires_at <= current) {
          ctx.issues.push({
            code: 'custom',
            message: 'Must be in the future',
            path: ['expires_at'],
            input: value.expires_at,
          });
          return z.NEVER;
        }
        if (expires_at - current > QUICK_LINK_LIMITS.MAX_EXPIRY_MS) {
          ctx.issues.push({
            code: 'custom',
            message: `Must be at most ${QUICK_LINK_LIMITS.MAX_EXPIRY_DAYS} days ahead`,
            path: ['expires_at'],
            input: value.expires_at,
          });
          return z.NEVER;
        }
      }
      return {
        scope: {
          organization_ids: unique(value.scope?.organization_ids ?? []),
          levels: unique(value.scope?.levels ?? []),
          date_start,
          date_end,
        },
        expires_at,
      };
    });
}
