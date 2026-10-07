import { PublicLinkErrorKind } from '../enums/public_link_error_kind.enum';
import { map_public_link_error } from './map_public_link_error';

const translate = (key: string) => key;

describe('map_public_link_error', () => {
  it('says only that the link is no longer active, with no hint why', () => {
    const mapped = map_public_link_error(PublicLinkErrorKind.NOT_ACTIVE, translate);

    expect(mapped.headline).toBe('This link is no longer active');
    expect(mapped.description).toBe('Ask the person who sent it for a new one.');
    expect(`${mapped.headline} ${mapped.description}`).not.toMatch(/expire|revok|exist|invalid/i);
  });

  it('asks for a moment when rate limited', () => {
    const mapped = map_public_link_error(PublicLinkErrorKind.RATE_LIMITED, translate);

    expect(mapped.headline).toBe('Too many requests');
    expect(mapped.description).toBe('Please try again in a moment.');
  });

  it('asks to check the connection otherwise', () => {
    const mapped = map_public_link_error(PublicLinkErrorKind.UNAVAILABLE, translate);

    expect(mapped.headline).toBe('Games could not be loaded');
    expect(mapped.description).toBe('Check your connection and try again.');
  });
});
