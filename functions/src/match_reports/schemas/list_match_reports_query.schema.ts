import { z } from 'zod';
import { MatchReportStatus } from '../../domain/match_reports/match_report_status.enum.js';
import { resource_id_schema } from '../../http/schemas/resource_id_param.schema.js';

/**
 * Treats a blank query-string value as not supplied.
 * @param value Raw query value.
 * @returns Undefined for an empty string; otherwise the value unchanged.
 */
function blank_as_absent(value: unknown): unknown {
  return value === '' ? undefined : value;
}

/**
 * Query of `GET /api/match_reports`: an optional status and an optional game. Unknown parameters
 * are rejected and a blank value counts as not supplied.
 */
export const list_match_reports_query_schema = z
  .strictObject({
    status: z.preprocess(blank_as_absent, z.enum(MatchReportStatus).optional()),
    game_id: z.preprocess(blank_as_absent, resource_id_schema.optional()),
  })
  .transform((value) => ({
    status: value.status ?? null,
    game_id: value.game_id ?? null,
  }));
