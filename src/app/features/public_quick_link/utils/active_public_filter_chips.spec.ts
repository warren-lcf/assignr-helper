import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';
import { DEFAULT_PUBLIC_FILTERS } from '../constants/default_public_filters.constant';
import { PublicFilterKey } from '../enums/public_filter_key.enum';
import {
  active_public_filter_chips,
  has_active_public_filters,
} from './active_public_filter_chips';

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? interpolate_translation_params(key, params) : key;

describe('active_public_filter_chips', () => {
  it('has no chips for no facets', () => {
    expect(active_public_filter_chips(DEFAULT_PUBLIC_FILTERS, translate)).toEqual([]);
  });

  it('has a keyed chip per facet, and none for the search', () => {
    expect(
      active_public_filter_chips(
        {
          search: 'lions',
          level: 'Premier',
          league: 'Fall League',
          location_group: 'Location to be announced',
        },
        translate,
      ),
    ).toEqual([
      { key: PublicFilterKey.LEVEL, label: 'Level: Premier' },
      { key: PublicFilterKey.LEAGUE, label: 'League: Fall League' },
      { key: PublicFilterKey.LOCATION_GROUP, label: 'Location: Location to be announced' },
    ]);
  });
});

describe('has_active_public_filters', () => {
  it('is false for the defaults and a blank search', () => {
    expect(has_active_public_filters(DEFAULT_PUBLIC_FILTERS)).toBe(false);
    expect(has_active_public_filters({ ...DEFAULT_PUBLIC_FILTERS, search: '  ' })).toBe(false);
  });

  it('is true for search text or any facet', () => {
    expect(has_active_public_filters({ ...DEFAULT_PUBLIC_FILTERS, search: 'a' })).toBe(true);
    expect(has_active_public_filters({ ...DEFAULT_PUBLIC_FILTERS, level: 'x' })).toBe(true);
    expect(has_active_public_filters({ ...DEFAULT_PUBLIC_FILTERS, league: 'x' })).toBe(true);
    expect(has_active_public_filters({ ...DEFAULT_PUBLIC_FILTERS, location_group: 'x' })).toBe(
      true,
    );
  });
});
