import { JERSEY_MAX } from '../constants/match_report_limits.constant';
import { IAddIncidentRequest } from '../models/add_incident_request.model';
import { ICardDraft } from '../models/card_draft.model';
import { generate_idempotency_key } from './generate_idempotency_key';

/**
 * The player number the keypad holds.
 * @param draft The card being put together.
 * @returns A number from 0 to 99, or null when none was typed or "No number" was chosen.
 */
export function parse_jersey_number(
  draft: Pick<ICardDraft, 'jersey_digits' | 'no_number'>,
): number | null {
  if (draft.no_number || draft.jersey_digits === '') return null;
  const parsed = Number(draft.jersey_digits);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= JERSEY_MAX ? parsed : null;
}

/**
 * Turns a finished draft into the request that adds the card. Returns null while the team or the card
 * is still missing, so a half-made card can never be sent.
 * @param draft The card being put together.
 * @param minute The minute to record (the chosen one, or the default).
 * @param key The idempotency key to use; a fresh one when left out.
 * @returns The request, or null when the draft is not complete.
 */
export function build_card_request(
  draft: ICardDraft,
  minute: number,
  key: string = generate_idempotency_key(),
): IAddIncidentRequest | null {
  if (draft.team_side === null || draft.incident_type === null) return null;
  return {
    idempotency_key: key,
    team_side: draft.team_side,
    incident_type: draft.incident_type,
    jersey_number: parse_jersey_number(draft),
    minute,
    reason_code: draft.reason_code,
    notes: null,
  };
}
