import { HttpErrorResponse } from '@angular/common/http';
import { FeedErrorKind } from '../enums/feed_error_kind.enum';
import { map_feed_api_error } from './map_feed_api_error';

const translate = (key: string): string => `T(${key})`;

function api_error(status: number, code: string): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: { code, message: 'Server English', violations: [] },
  });
}

describe('map_feed_api_error', () => {
  it('asks a platform administrator to choose a tenant', () => {
    expect(map_feed_api_error(api_error(400, 'TENANT_REQUIRED'), translate, 'FALLBACK')).toEqual({
      kind: FeedErrorKind.TENANT_REQUIRED,
      message: 'T(Pick the tenant to act in from the header, then try again.)',
    });
  });

  it('says the role cannot manage the link', () => {
    const mapped = map_feed_api_error(api_error(403, 'PERMISSION_REQUIRED'), translate, 'FALLBACK');

    expect(mapped.kind).toBe(FeedErrorKind.PERMISSION_REQUIRED);
    expect(mapped.message).toBe('T(Your role cannot manage the calendar link.)');
  });

  it('points a second create to rotating the link', () => {
    const mapped = map_feed_api_error(api_error(409, 'FEED_EXISTS'), translate, 'FALLBACK');

    expect(mapped.kind).toBe(FeedErrorKind.ALREADY_EXISTS);
    expect(mapped.message).toBe(
      'T(You already have a calendar link. To get a new address, rotate the existing one.)',
    );
  });

  it('says there is no link to rotate', () => {
    const mapped = map_feed_api_error(api_error(404, 'NOT_FOUND'), translate, 'FALLBACK');

    expect(mapped.kind).toBe(FeedErrorKind.NOT_FOUND);
    expect(mapped.message).toBe(
      'T(There is no calendar link to change. It may have been revoked.)',
    );
  });

  it('uses the caller’s sentence for anything else, never the server’s English', () => {
    const mapped = map_feed_api_error(api_error(500, 'INTERNAL'), translate, 'FALLBACK');

    expect(mapped).toEqual({ kind: FeedErrorKind.GENERIC, message: 'FALLBACK' });
  });

  it('uses the caller’s sentence for a failure with no API body', () => {
    expect(map_feed_api_error(new Error('network'), translate, 'FALLBACK').message).toBe(
      'FALLBACK',
    );
  });

  it('reads the API error off the cause a resource wraps it in', () => {
    const wrapped = { cause: api_error(409, 'FEED_EXISTS') };

    expect(map_feed_api_error(wrapped, translate, 'FALLBACK').kind).toBe(
      FeedErrorKind.ALREADY_EXISTS,
    );
  });
});
