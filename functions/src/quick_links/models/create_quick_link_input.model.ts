import { IQuickLinkScope } from '../../domain/quick_links/quick_link_scope.model.js';

/** A validated request to create a quick link, with every default resolved. */
export interface ICreateQuickLinkInput {
  scope: IQuickLinkScope;
  /** UTC milliseconds after which the link stops working; null never expires. */
  expires_at: number | null;
}
