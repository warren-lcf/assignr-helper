import { describe_feed_activity } from './describe_feed_activity';

const translate = (key: string): string => `T(${key})`;
const format_date = (utc_ms: number): string => `D(${utc_ms})`;

describe('describe_feed_activity', () => {
  it('says "Not fetched yet", translated, when no calendar app has read the feed', () => {
    const text = describe_feed_activity(
      { last_fetched_at: null, fetch_count: 0 },
      format_date,
      translate,
    );

    expect(text.last_fetched).toBe('T(Not fetched yet)');
    expect(text.fetch_count).toBe('0');
  });

  it('formats the last fetch for the viewer and groups the count', () => {
    const text = describe_feed_activity(
      { last_fetched_at: 1_790_000_000_000, fetch_count: 1234 },
      format_date,
      translate,
    );

    expect(text.last_fetched).toBe('D(1790000000000)');
    expect(text.fetch_count).toBe('1,234');
  });
});
