import { describe, expect, it } from 'vitest';
import { read_public_app_origin } from './read_public_app_origin.js';

const LOCAL = { FUNCTIONS_EMULATOR: 'true' };

describe('read_public_app_origin', () => {
  it('returns an https origin as it is', () => {
    expect(
      read_public_app_origin({ PUBLIC_APP_ORIGIN: 'https://assignr-helper-prod.web.app' }),
    ).toBe('https://assignr-helper-prod.web.app');
  });

  it('keeps a non-default port and trims whitespace', () => {
    expect(read_public_app_origin({ PUBLIC_APP_ORIGIN: ' https://app.example.com:8443 ' })).toBe(
      'https://app.example.com:8443',
    );
  });

  it.each([undefined, '', '   '])('fails closed when it is %j', (value) => {
    expect(() => read_public_app_origin({ PUBLIC_APP_ORIGIN: value })).toThrow(
      'Missing required environment variable PUBLIC_APP_ORIGIN',
    );
  });

  it.each([
    'app.example.com',
    'not a url',
    'https://app.example.com/',
    'https://app.example.com/path',
    'https://app.example.com?x=1',
    'https://app.example.com#top',
    'https://user:pass@app.example.com',
    'https://user@app.example.com',
    'ftp://app.example.com',
    'javascript:alert(1)',
    'http://app.example.com',
    'http://localhost:5000/',
  ])('refuses %j', (value) => {
    expect(() => read_public_app_origin({ PUBLIC_APP_ORIGIN: value, ...LOCAL })).toThrow(
      'PUBLIC_APP_ORIGIN',
    );
  });

  it('accepts http://localhost:<port> only in the local environment', () => {
    const origin = 'http://localhost:5000';

    expect(read_public_app_origin({ PUBLIC_APP_ORIGIN: origin, FUNCTIONS_EMULATOR: 'true' })).toBe(
      origin,
    );
    expect(
      read_public_app_origin({
        PUBLIC_APP_ORIGIN: origin,
        SPANNER_EMULATOR_HOST: 'localhost:9010',
      }),
    ).toBe(origin);
    expect(() => read_public_app_origin({ PUBLIC_APP_ORIGIN: origin })).toThrow('https');
    expect(() =>
      read_public_app_origin({ PUBLIC_APP_ORIGIN: origin, FUNCTIONS_EMULATOR: 'false' }),
    ).toThrow('https');
  });

  it('never accepts plain http for a host other than localhost, even locally', () => {
    expect(() =>
      read_public_app_origin({ PUBLIC_APP_ORIGIN: 'http://evil.example.com', ...LOCAL }),
    ).toThrow('https');
    expect(() =>
      read_public_app_origin({ PUBLIC_APP_ORIGIN: 'http://localhost.evil.com', ...LOCAL }),
    ).toThrow('https');
  });
});
