import {
  IShareLinkManagerItem,
  ShareLinkManagerStatus,
} from '@hch-shared-libraries/ui-kit/common/share_link_manager';
import { FEED_LINK_ID, FEED_RESOURCE_TYPE } from '../constants/my_schedule.constant';
import { IFeedView } from '../models/feed_view.model';

/**
 * Maps the referee's calendar feed to the row the ui-kit's share link manager draws. The feed has no
 * expiry and a revoked feed is not listed at all, so those are fixed; "last viewed" and "views" carry
 * the last fetch and the fetch count.
 * @param feed The feed.
 * @param scope_label The translated name the row and its dialogs use.
 * @returns The manager's item.
 */
export function build_feed_link_item(feed: IFeedView, scope_label: string): IShareLinkManagerItem {
  return {
    link_id: FEED_LINK_ID,
    status: ShareLinkManagerStatus.ACTIVE,
    scope: { resource_type: FEED_RESOURCE_TYPE, filter_json: {} },
    scope_label,
    expires_at: null,
    revoked_at: null,
    last_viewed_at: feed.last_fetched_at,
    view_count: feed.fetch_count,
    rotation_count: feed.rotation_count,
    created_at: feed.created_at,
    created_by: '',
  };
}
