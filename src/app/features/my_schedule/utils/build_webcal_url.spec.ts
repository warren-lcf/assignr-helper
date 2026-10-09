import { build_webcal_url } from './build_webcal_url';

describe('build_webcal_url', () => {
  it('swaps https for webcal and keeps the rest', () => {
    expect(build_webcal_url('https://app.example.com/api/public/cal/abc.ics')).toBe(
      'webcal://app.example.com/api/public/cal/abc.ics',
    );
  });

  it('also accepts a plain http address, as on a development machine', () => {
    expect(build_webcal_url('http://localhost:4200/api/public/cal/abc.ics')).toBe(
      'webcal://localhost:4200/api/public/cal/abc.ics',
    );
  });

  it('refuses anything that is not an http(s) address', () => {
    expect(build_webcal_url('javascript:alert(1)')).toBeNull();
    expect(build_webcal_url('ftp://example.com/x.ics')).toBeNull();
    expect(build_webcal_url('')).toBeNull();
  });
});
