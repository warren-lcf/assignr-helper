import { DataClassification } from '@hch-shared-libraries/domain/classification';
import { z } from 'zod';
import { has_control_characters } from '../../domain/text/has_control_characters.js';
import { MATCH_REPORT_LIMITS } from '../match_report_limits.constant.js';
import { ISetScoresInput } from '../models/set_scores_input.model.js';

/** A goal count, or null to clear it. */
const score = z
  .number({ error: 'Must be a whole number from 0 to 99, or null' })
  .int('Must be a whole number')
  .min(0, 'Must be at least 0')
  .max(MATCH_REPORT_LIMITS.MAX_SCORE, `Must be at most ${MATCH_REPORT_LIMITS.MAX_SCORE}`)
  .nullable()
  .meta({ pii: false, classification: DataClassification.INTERNAL });

/**
 * Body of `PUT /api/match_reports/:report_id/scores`. Both scores are required (null clears one);
 * `notes` may be left out to keep the current notes, or null or blank to clear them. Notes may
 * hold line breaks but no other control characters.
 */
export const set_scores_body_schema = z
  .strictObject({
    home_score: score,
    away_score: score,
    notes: z
      .string({ error: 'Must be text' })
      .max(
        MATCH_REPORT_LIMITS.MAX_REPORT_NOTES_LENGTH,
        `Must be at most ${MATCH_REPORT_LIMITS.MAX_REPORT_NOTES_LENGTH} characters`,
      )
      .refine((value) => !has_control_characters(value, true), {
        error: 'Must not contain control characters',
      })
      .nullable()
      .optional()
      .meta({ pii: true, classification: DataClassification.PII }),
    client_revision: z
      .number({ error: 'Must be a whole number' })
      .int('Must be a whole number')
      .min(0, 'Must not be negative')
      .max(Number.MAX_SAFE_INTEGER - 1, 'Is too large')
      .meta({ pii: false, classification: DataClassification.INTERNAL }),
  })
  .transform((value): ISetScoresInput => {
    const trimmed = typeof value.notes === 'string' ? value.notes.trim() : value.notes;
    return {
      home_score: value.home_score,
      away_score: value.away_score,
      notes: trimmed === '' ? null : trimmed,
      client_revision: value.client_revision,
    };
  });
