import { IAuditStamp } from '../../sync/models/audit_stamp.model.js';

/** A tenant's calendar feed as stored: one row per tenant, holding only the hash of the link's token. */
export interface IStoredCalendarFeed extends IAuditStamp {
  tenant_id: string;
  /** SHA-256 hex of the current token. The token itself is never stored. */
  token_hash: string;
  /** How many times the token was replaced; 0 for a feed that was never rotated. */
  rotation_count: number;
  /** Successful fetches of the current token (reset when the token is replaced). */
  fetch_count: number;
  /** UTC milliseconds of the latest fetch of the current token, or null if it was never fetched. */
  last_fetched_at: number | null;
}
