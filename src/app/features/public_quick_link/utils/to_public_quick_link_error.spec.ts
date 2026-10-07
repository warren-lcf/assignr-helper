import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { PUBLIC_FAKE_TOKEN } from '../mocks/public_games_result.mock';
import { to_public_quick_link_error } from './to_public_quick_link_error';

const URL_WITH_TOKEN = `/api/public/q/${PUBLIC_FAKE_TOKEN}/games`;

describe('to_public_quick_link_error', () => {
  it('maps 404 to "not active", whatever the body says, with the body having no violations', () => {
    const error = to_public_quick_link_error(
      new HttpErrorResponse({
        status: 404,
        url: URL_WITH_TOKEN,
        error: { code: 'NOT_FOUND', message: 'Not found' },
      }),
    );

    expect(error.kind).toBe(PublicLinkErrorKind.NOT_ACTIVE);
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('maps 429 to "rate limited" and reads Retry-After', () => {
    const error = to_public_quick_link_error(
      new HttpErrorResponse({
        status: 429,
        url: URL_WITH_TOKEN,
        headers: new HttpHeaders({ 'Retry-After': '12' }),
        error: { code: 'RATE_LIMITED', message: 'Slow down' },
      }),
    );

    expect(error.kind).toBe(PublicLinkErrorKind.RATE_LIMITED);
    expect(error.retry_after_ms).toBe(12_000);
  });

  it('has no wait when 429 carries no Retry-After', () => {
    const error = to_public_quick_link_error(new HttpErrorResponse({ status: 429 }));

    expect(error.retry_after_ms).toBeNull();
    expect(error.code).toBeNull();
  });

  it.each([500, 503, 400, 0])('maps status %i to "unavailable"', (status) => {
    expect(to_public_quick_link_error(new HttpErrorResponse({ status })).kind).toBe(
      PublicLinkErrorKind.UNAVAILABLE,
    );
  });

  it('maps something that is not an HTTP error to "unavailable"', () => {
    expect(to_public_quick_link_error(new Error('boom')).kind).toBe(
      PublicLinkErrorKind.UNAVAILABLE,
    );
  });

  it('never carries the address, and so never the token', () => {
    const error = to_public_quick_link_error(
      new HttpErrorResponse({ status: 500, url: URL_WITH_TOKEN, statusText: 'Server error' }),
    );

    expect(error.message).not.toContain(PUBLIC_FAKE_TOKEN);
    expect(JSON.stringify(error)).not.toContain(PUBLIC_FAKE_TOKEN);
    expect(error.stack ?? '').not.toContain(PUBLIC_FAKE_TOKEN);
  });
});
