import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { PublicUnsubscribeError } from './public_unsubscribe_error';

describe('PublicUnsubscribeError', () => {
  it('carries only the kind, status and code', () => {
    const error = new PublicUnsubscribeError(UnsubscribeErrorKind.NOT_VALID, 404, 'NOT_FOUND');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PublicUnsubscribeError');
    expect(error.kind).toBe(UnsubscribeErrorKind.NOT_VALID);
    expect(error.status).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Public unsubscribe request failed (NOT_VALID, status 404)');
  });

  it('defaults the code to null', () => {
    expect(new PublicUnsubscribeError(UnsubscribeErrorKind.UNAVAILABLE, 0).code).toBeNull();
  });
});
