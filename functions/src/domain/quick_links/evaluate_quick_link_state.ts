import { IQuickLinkRecord } from './quick_link_record.model.js';
import { QuickLinkState } from './quick_link_state.enum.js';

/**
 * Decides whether a quick link may be used at a given instant.
 * Revocation wins over expiry; a link whose `expires_at` equals `now` is expired.
 * @param record The stored link.
 * @param now The current instant in UTC milliseconds.
 * @returns The link's state.
 */
export function evaluate_quick_link_state(record: IQuickLinkRecord, now: number): QuickLinkState {
  if (record.revoked_at !== null) {
    return QuickLinkState.REVOKED;
  }
  if (record.expires_at !== null && record.expires_at <= now) {
    return QuickLinkState.EXPIRED;
  }
  return QuickLinkState.ACTIVE;
}
