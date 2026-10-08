import { RecipientMode } from '../enums/recipient_mode.enum.js';
import { IDraftContent } from '../models/draft_content.model.js';
import { IDraftFilters } from '../models/draft_filters.model.js';

/** Version of the JSON layout kept in `email_drafts.filter_json`. */
const CONTENT_JSON_VERSION = 1;

const NULLABLE_TEXT_FILTERS = [
  'search',
  'level',
  'league',
  'age_group',
  'location_group',
  'organization_id',
  'connection_id',
] as const;

/**
 * Writes a draft's content as the JSON kept in `email_drafts.filter_json`: the filters, the intro
 * and the quick link and recipient choices.
 * @param content The draft content.
 * @returns JSON text.
 */
export function serialize_draft_content(content: IDraftContent): string {
  return JSON.stringify({
    version: CONTENT_JSON_VERSION,
    intro: content.intro,
    filters: content.filters,
    include_quick_link: content.include_quick_link,
    quick_link_expiry_days: content.quick_link_expiry_days,
    recipient_mode: content.recipient_mode,
    contact_ids: content.contact_ids,
  });
}

/**
 * Checks and reads the JSON written by {@link serialize_draft_content}. A value that is not
 * exactly that shape is an error rather than a guess, so a corrupt row can never send to a wider
 * audience or with different filters than the owner chose.
 * @param subject The draft's subject, which is kept in its own column.
 * @param json Text of the `filter_json` column.
 * @returns The draft content.
 * @throws Error naming `filter_json` when the text is missing, corrupt or the wrong shape.
 */
export function parse_draft_content(subject: string, json: unknown): IDraftContent {
  const fail = (): never => {
    throw new Error('Column filter_json does not hold valid email draft content');
  };
  if (typeof json !== 'string') return fail();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return fail();
  }
  const candidate = parsed as Record<string, unknown> | null;
  if (
    candidate === null ||
    typeof candidate !== 'object' ||
    candidate['version'] !== CONTENT_JSON_VERSION
  ) {
    return fail();
  }
  const filters = candidate['filters'] as Record<string, unknown> | null;
  if (filters === null || typeof filters !== 'object') return fail();
  for (const name of NULLABLE_TEXT_FILTERS) {
    if (filters[name] !== null && typeof filters[name] !== 'string') return fail();
  }
  for (const name of ['date_from', 'date_to'] as const) {
    if (filters[name] !== null && typeof filters[name] !== 'number') return fail();
  }
  if (typeof filters['only_with_open_slots'] !== 'boolean') return fail();
  const contact_ids = candidate['contact_ids'];
  if (candidate['intro'] !== null && typeof candidate['intro'] !== 'string') {
    return fail();
  }
  if (typeof candidate['include_quick_link'] !== 'boolean') return fail();
  if (typeof candidate['quick_link_expiry_days'] !== 'number') return fail();
  if (
    candidate['recipient_mode'] !== (RecipientMode.ALL_CONSENTED as string) &&
    candidate['recipient_mode'] !== (RecipientMode.SELECTED as string)
  ) {
    return fail();
  }
  if (!Array.isArray(contact_ids) || contact_ids.some((id) => typeof id !== 'string')) {
    return fail();
  }
  return {
    subject,
    intro: candidate['intro'] as string | null,
    filters: {
      search: filters['search'] as string | null,
      level: filters['level'] as string | null,
      league: filters['league'] as string | null,
      age_group: filters['age_group'] as string | null,
      location_group: filters['location_group'] as string | null,
      organization_id: filters['organization_id'] as string | null,
      connection_id: filters['connection_id'] as string | null,
      only_with_open_slots: filters['only_with_open_slots'] as boolean,
      date_from: filters['date_from'] as number | null,
      date_to: filters['date_to'] as number | null,
    } satisfies IDraftFilters,
    include_quick_link: candidate['include_quick_link'],
    quick_link_expiry_days: candidate['quick_link_expiry_days'],
    recipient_mode: candidate['recipient_mode'] as RecipientMode,
    contact_ids: contact_ids as string[],
  };
}
