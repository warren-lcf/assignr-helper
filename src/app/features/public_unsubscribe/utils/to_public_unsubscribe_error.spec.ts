import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { FAKE_UNSUBSCRIBE_TOKEN } from '../mocks/unsubscribe_info.mock';
import { to_public_unsubscribe_error } from './to_public_unsubscribe_error';

const URL_WITH_TOKEN = `/api/public/unsubscribe/${FAKE_UNSUBSCRIBE_TOKEN}`;

describe('to_public_unsubscribe_error', () => {
  it('reads a 404 as a link that is not valid, keeping the code', () => {
    const error = to_public_unsubscribe_error(
      new HttpErrorResponse({ status: 404, url: URL_WITH_TOKEN, error: { code: 'NOT_FOUND' } }),
    );

    expect(error.kind).toBe(UnsubscribeErrorKind.NOT_VALID);
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
  });

  it('reads a 429 as rate limited', () => {
    const error = to_public_unsubscribe_error(
      new HttpErrorResponse({
        status: 429,
        url: URL_WITH_TOKEN,
        headers: new HttpHeaders({ 'Retry-After': '30' }),
        error: { code: 'RATE_LIMITED' },
      }),
    );

    expect(error.kind).toBe(UnsubscribeErrorKind.RATE_LIMITED);
    expect(error.code).toBe('RATE_LIMITED');
  });

  it('reads any other status as unavailable', () => {
    const error = to_public_unsubscribe_error(
      new HttpErrorResponse({ status: 500, url: URL_WITH_TOKEN, error: 'html' }),
    );

    expect(error.kind).toBe(UnsubscribeErrorKind.UNAVAILABLE);
    expect(error.status).toBe(500);
    expect(error.code).toBeNull();
  });

  it('reads a failure that is not an HTTP error as a network failure', () => {
    const error = to_public_unsubscribe_error(new TypeError('Failed to fetch'));

    expect(error.kind).toBe(UnsubscribeErrorKind.UNAVAILABLE);
    expect(error.status).toBe(0);
  });

  it('never keeps the address, and so never the token', () => {
    const error = to_public_unsubscribe_error(
      new HttpErrorResponse({ status: 404, url: URL_WITH_TOKEN }),
    );

    expect(JSON.stringify(error)).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
    expect(error.message).not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
    expect(error.stack ?? '').not.toContain(FAKE_UNSUBSCRIBE_TOKEN);
  });
});
