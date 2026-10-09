import { DataClassification } from '@hch-shared-libraries/domain/classification';
import { z } from 'zod';
import { IncidentType } from '../../domain/match_reports/incident_type.enum.js';
import { TeamSide } from '../../domain/match_reports/team_side.enum.js';
import { has_control_characters } from '../../domain/text/has_control_characters.js';
import { MATCH_REPORT_LIMITS } from '../match_report_limits.constant.js';
import { IAddIncidentInput } from '../models/add_incident_input.model.js';

const internal = { pii: false, classification: DataClassification.INTERNAL } as const;

/**
 * Body of `POST /api/match_reports/:report_id/incidents`. The team side is required: the app
 * always asks for the team first, and a stored incident has no way to be without one. Optional
 * numbers and texts may be left out or null. Notes may hold line breaks but no other control
 * characters.
 */
export const add_incident_body_schema = z
  .strictObject({
    idempotency_key: z
      .string({ error: 'Must be text' })
      .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Must be 8 to 64 letters, digits, - or _')
      .meta(internal),
    team_side: z.enum(TeamSide, { error: 'Must be HOME or AWAY' }).meta(internal),
    incident_type: z.enum(IncidentType, { error: 'Must be a known incident type' }).meta(internal),
    jersey_number: z
      .number({ error: 'Must be a whole number' })
      .int('Must be a whole number')
      .min(0, 'Must be at least 0')
      .max(
        MATCH_REPORT_LIMITS.MAX_JERSEY_NUMBER,
        `Must be at most ${MATCH_REPORT_LIMITS.MAX_JERSEY_NUMBER}`,
      )
      .nullable()
      .optional()
      .meta({ pii: false, classification: DataClassification.CONFIDENTIAL }),
    minute: z
      .number({ error: 'Must be a whole number' })
      .int('Must be a whole number')
      .min(0, 'Must be at least 0')
      .max(MATCH_REPORT_LIMITS.MAX_MINUTE, `Must be at most ${MATCH_REPORT_LIMITS.MAX_MINUTE}`)
      .nullable()
      .optional()
      .meta(internal),
    reason_code: z
      .string({ error: 'Must be text' })
      .trim()
      .max(
        MATCH_REPORT_LIMITS.MAX_REASON_CODE_LENGTH,
        `Must be at most ${MATCH_REPORT_LIMITS.MAX_REASON_CODE_LENGTH} characters`,
      )
      .refine((value) => !has_control_characters(value), {
        error: 'Must not contain control characters or line breaks',
      })
      .nullable()
      .optional()
      .meta(internal),
    notes: z
      .string({ error: 'Must be text' })
      .max(
        MATCH_REPORT_LIMITS.MAX_INCIDENT_NOTES_LENGTH,
        `Must be at most ${MATCH_REPORT_LIMITS.MAX_INCIDENT_NOTES_LENGTH} characters`,
      )
      .refine((value) => !has_control_characters(value, true), {
        error: 'Must not contain control characters',
      })
      .nullable()
      .optional()
      .meta({ pii: true, classification: DataClassification.PII }),
  })
  .transform((value): IAddIncidentInput => {
    const notes = typeof value.notes === 'string' ? value.notes.trim() : '';
    const reason_code = typeof value.reason_code === 'string' ? value.reason_code : '';
    return {
      idempotency_key: value.idempotency_key,
      team_side: value.team_side,
      incident_type: value.incident_type,
      jersey_number: value.jersey_number ?? null,
      minute: value.minute ?? null,
      reason_code: reason_code === '' ? null : reason_code,
      notes: notes === '' ? null : notes,
    };
  });
