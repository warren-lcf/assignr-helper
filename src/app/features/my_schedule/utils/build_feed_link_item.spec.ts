import { ShareLinkManagerStatus } from '@hch-shared-libraries/ui-kit/common/share_link_manager';
import { make_feed_view } from '../mocks/feed_view.mock';
import { build_feed_link_item } from './build_feed_link_item';

describe('build_feed_link_item', () => {
  it('maps the feed to an active, never-expiring, unrevoked row with the fixed id and scope', () => {
    const item = build_feed_link_item(make_feed_view(), 'My schedule calendar link');

    expect(item).toEqual({
      link_id: 'my-schedule-feed',
      status: ShareLinkManagerStatus.ACTIVE,
      scope: { resource_type: 'my_schedule', filter_json: {} },
      scope_label: 'My schedule calendar link',
      expires_at: null,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      rotation_count: 0,
      created_at: Date.UTC(2026, 9, 5, 15, 4, 0),
      created_by: '',
    });
  });

  it('carries the last fetch as "last viewed" and the fetch count as "views"', () => {
    const feed = make_feed_view({
      last_fetched_at: 1_790_000_000_000,
      fetch_count: 42,
      rotation_count: 3,
    });

    const item = build_feed_link_item(feed, 'Label');

    expect(item.last_viewed_at).toBe(1_790_000_000_000);
    expect(item.view_count).toBe(42);
    expect(item.rotation_count).toBe(3);
  });
});
