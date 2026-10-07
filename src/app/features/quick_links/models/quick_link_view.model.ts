import { QuickLinkState } from '../enums/quick_link_state.enum';
import { IQuickLinkScope } from './quick_link_scope.model';

/** A quick link as the owner screens see it. The secret token is never part of it. */
export interface IQuickLinkView {
  /** Id of the link (not its token). */
  link_id: string;
  /** Which games the link shows. */
  scope: IQuickLinkScope;
  /** Whether the link works right now. */
  state: QuickLinkState;
  /** When the link stops working, UTC milliseconds; null never expires. */
  expires_at: number | null;
  /** When the link was revoked, UTC milliseconds; null while it has not been. */
  revoked_at: number | null;
  /** When someone last opened the link, UTC milliseconds; null if never. */
  last_viewed_at: number | null;
  /** How many times the link has been opened. */
  view_count: number;
  /** When the link was created, UTC milliseconds. */
  created_at: number;
}
