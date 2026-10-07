import { IStoredQuickLink } from './stored_quick_link.model.js';

/** The outcome of revoking a quick link. */
export interface IRevokeQuickLinkResult {
  /** The link as it is now (revoked). */
  link: IStoredQuickLink;
  /** True only for the call that actually revoked it; false when it was already revoked. */
  revoked_now: boolean;
}
