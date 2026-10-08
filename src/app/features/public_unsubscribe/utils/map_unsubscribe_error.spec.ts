import { UnsubscribeErrorKind } from '../enums/unsubscribe_error_kind.enum';
import { map_unsubscribe_error } from './map_unsubscribe_error';

const translate = (key: string): string => `T(${key})`;

describe('map_unsubscribe_error', () => {
  it('words a link that is not valid without hinting at why', () => {
    const mapped = map_unsubscribe_error(UnsubscribeErrorKind.NOT_VALID, translate);

    expect(mapped.headline).toBe('T(This link is not valid)');
    expect(`${mapped.headline} ${mapped.description}`.toLowerCase()).not.toContain('expired');
  });

  it('asks the visitor to wait when rate limited', () => {
    expect(map_unsubscribe_error(UnsubscribeErrorKind.RATE_LIMITED, translate)).toMatchObject({
      kind: UnsubscribeErrorKind.RATE_LIMITED,
      headline: 'T(Too many requests)',
    });
  });

  it('asks the visitor to try again for anything else', () => {
    expect(map_unsubscribe_error(UnsubscribeErrorKind.UNAVAILABLE, translate)).toMatchObject({
      kind: UnsubscribeErrorKind.UNAVAILABLE,
      headline: 'T(Something went wrong)',
      description: 'T(Check your connection and try again.)',
    });
  });
});
