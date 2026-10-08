import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { PublicUnsubscribeError } from '../services/public_unsubscribe_error';
import { unwrap_public_unsubscribe_error } from './unwrap_public_unsubscribe_error';

describe('unwrap_public_unsubscribe_error', () => {
  const error = new PublicUnsubscribeError(UnsubscribeErrorKind.NOT_VALID, 404);

  it('returns the error itself', () => {
    expect(unwrap_public_unsubscribe_error(error)).toBe(error);
  });

  it('finds it on the cause of the error a resource wraps it in', () => {
    expect(unwrap_public_unsubscribe_error(new Error('wrapped', { cause: error }))).toBe(error);
  });

  it('returns null for anything else', () => {
    expect(unwrap_public_unsubscribe_error(new Error('other'))).toBeNull();
    expect(unwrap_public_unsubscribe_error(undefined)).toBeNull();
    expect(unwrap_public_unsubscribe_error('text')).toBeNull();
  });
});
