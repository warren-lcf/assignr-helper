import { build_feed_url } from './build_feed_url';

describe('build_feed_url', () => {
  it('joins the origin and the path', () => {
    expect(build_feed_url('https://app.example.com', '/api/public/cal/abc.ics')).toBe(
      'https://app.example.com/api/public/cal/abc.ics',
    );
  });

  it('adds the slash a path without one needs', () => {
    expect(build_feed_url('https://app.example.com', 'api/public/cal/abc.ics')).toBe(
      'https://app.example.com/api/public/cal/abc.ics',
    );
  });
});
