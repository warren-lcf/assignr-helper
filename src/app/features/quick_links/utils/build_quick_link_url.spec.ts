import { build_quick_link_url } from './build_quick_link_url';

describe('build_quick_link_url', () => {
  it('joins the origin and the path', () => {
    expect(build_quick_link_url('https://app.example.com', '/q/abc')).toBe(
      'https://app.example.com/q/abc',
    );
  });

  it('adds the missing slash', () => {
    expect(build_quick_link_url('http://localhost:4300', 'q/abc')).toBe(
      'http://localhost:4300/q/abc',
    );
  });
});
