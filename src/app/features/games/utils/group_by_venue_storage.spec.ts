import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GROUP_BY_VENUE_STORAGE_KEY,
  read_group_by_venue,
  write_group_by_venue,
} from './group_by_venue_storage';

describe('group_by_venue_storage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('groups by venue when nothing is remembered', () => {
    expect(read_group_by_venue()).toBe(true);
  });

  it('remembers turning grouping off and on again', () => {
    write_group_by_venue(false);
    expect(read_group_by_venue()).toBe(false);

    write_group_by_venue(true);
    expect(read_group_by_venue()).toBe(true);
  });

  it('treats an unexpected stored value as the default', () => {
    localStorage.setItem(GROUP_BY_VENUE_STORAGE_KEY, 'maybe');

    expect(read_group_by_venue()).toBe(true);
  });

  it('falls back to grouped when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(read_group_by_venue()).toBe(true);
  });

  it('ignores a storage failure when remembering', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => write_group_by_venue(false)).not.toThrow();
  });
});
