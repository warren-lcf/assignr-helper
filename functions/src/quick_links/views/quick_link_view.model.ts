import { IQuickLinkScope } from '../../domain/quick_links/quick_link_scope.model.js';
import { QuickLinkState } from '../../domain/quick_links/quick_link_state.enum.js';

/** A quick link as the API returns it: never the token, its hash, the tenant id or audit stamps. */
export interface IQuickLinkView {
  link_id: string;
  scope: IQuickLinkScope;
  state: QuickLinkState;
  expires_at: number | null;
  revoked_at: number | null;
  last_viewed_at: number | null;
  view_count: number;
  created_at: number;
}
