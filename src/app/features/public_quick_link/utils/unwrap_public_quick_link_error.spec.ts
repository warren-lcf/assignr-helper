import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { PublicQuickLinkError } from '../services/public_quick_link_error';
import { unwrap_public_quick_link_error } from './unwrap_public_quick_link_error';

describe('unwrap_public_quick_link_error', () => {
  const error = new PublicQuickLinkError(PublicLinkErrorKind.NOT_ACTIVE, 404);

  it('returns the error itself', () => {
    expect(unwrap_public_quick_link_error(error)).toBe(error);
  });

  it('finds it on the cause of a wrapped resource error', () => {
    expect(unwrap_public_quick_link_error({ cause: error })).toBe(error);
  });

  it('is null for anything else', () => {
    expect(unwrap_public_quick_link_error(new Error('x'))).toBeNull();
    expect(unwrap_public_quick_link_error({ cause: 'x' })).toBeNull();
    expect(unwrap_public_quick_link_error(undefined)).toBeNull();
  });
});
