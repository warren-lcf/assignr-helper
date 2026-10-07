import { GamesScope } from '../enums/games_scope.enum';
import { LAST_SCOPE_STORAGE_KEY, read_last_scope, write_last_scope } from './last_scope_storage';

describe('last scope storage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to open games', () => {
    expect(read_last_scope()).toBe(GamesScope.OPEN);
  });

  it('remembers the scope', () => {
    write_last_scope(GamesScope.MINE);

    expect(localStorage.getItem(LAST_SCOPE_STORAGE_KEY)).toBe('MINE');
    expect(read_last_scope()).toBe(GamesScope.MINE);
  });

  it('ignores a stored value that is not a scope', () => {
    localStorage.setItem(LAST_SCOPE_STORAGE_KEY, 'EVERYTHING');

    expect(read_last_scope()).toBe(GamesScope.OPEN);
  });

  it('works without storage: reading falls back and writing does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(read_last_scope()).toBe(GamesScope.OPEN);
    expect(() => write_last_scope(GamesScope.ALL)).not.toThrow();
  });
});
