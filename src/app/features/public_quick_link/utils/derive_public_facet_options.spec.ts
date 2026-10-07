import { DEFAULT_PUBLIC_FILTERS } from '../constants/default_public_filters.constant';
import { PUBLIC_GAMES_RESULT } from '../mocks/public_games_result.mock';
import { derive_public_facet_options } from './derive_public_facet_options';

describe('derive_public_facet_options', () => {
  it('is empty before the first answer', () => {
    expect(derive_public_facet_options(undefined, DEFAULT_PUBLIC_FILTERS)).toEqual({
      level: [],
      league: [],
      location_group: [],
    });
  });

  it('takes the lists from the answer in the order the server sorted them', () => {
    expect(derive_public_facet_options(PUBLIC_GAMES_RESULT, DEFAULT_PUBLIC_FILTERS)).toEqual({
      level: ['Premier', 'Select'],
      league: ['Fall League'],
      location_group: ['Riverside Park', 'Location to be announced'],
    });
  });

  it('keeps a chosen value on offer when the answer no longer lists it', () => {
    const options = derive_public_facet_options(PUBLIC_GAMES_RESULT, {
      ...DEFAULT_PUBLIC_FILTERS,
      level: 'Recreational',
    });

    expect(options.level).toEqual(['Recreational', 'Premier', 'Select']);
  });

  it('does not duplicate a chosen value the answer lists', () => {
    const options = derive_public_facet_options(PUBLIC_GAMES_RESULT, {
      ...DEFAULT_PUBLIC_FILTERS,
      level: 'Select',
    });

    expect(options.level).toEqual(['Premier', 'Select']);
  });
});
