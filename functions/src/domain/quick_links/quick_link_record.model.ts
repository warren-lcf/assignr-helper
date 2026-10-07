import { IQuickLinkScope } from './quick_link_scope.model.js';

/** Stored quick link. Only the token hash is kept, never the token. */
export interface IQuickLinkRecord {
  link_id: string;
  tenant_id: string;
  /** SHA-256 hex of the bearer token. */
  token_hash: string;
  scope: IQuickLinkScope;
  /** UTC milliseconds after which the link stops working; null never expires. */
  expires_at: number | null;
  /** UTC milliseconds the link was revoked; null while not revoked. */
  revoked_at: number | null;
}
