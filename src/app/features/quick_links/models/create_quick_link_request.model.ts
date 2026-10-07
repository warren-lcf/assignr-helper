import { IQuickLinkScope } from './quick_link_scope.model';

/** Body of `POST /api/quick_links`. Every field is optional; an empty body makes an unrestricted link. */
export interface ICreateQuickLinkRequest {
  /** Restrictions; any part left out means "no restriction". */
  scope?: Partial<IQuickLinkScope>;
  /** When the link should stop working, UTC milliseconds in the future; null or left out never expires. */
  expires_at?: number | null;
}
