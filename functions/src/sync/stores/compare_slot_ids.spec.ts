import { describe, expect, it } from 'vitest';
import { compare_slot_ids } from './compare_slot_ids.js';

describe('compare_slot_ids', () => {
  it('sorts numeric suffixes numerically', () => {
    const ids = ['slot_10', 'slot_2', 'slot_1', 'slot_11', 'slot_3'];

    expect([...ids].sort(compare_slot_ids)).toEqual([
      'slot_1',
      'slot_2',
      'slot_3',
      'slot_10',
      'slot_11',
    ]);
  });

  it('falls back to string order for different prefixes or no suffix', () => {
    expect(compare_slot_ids('a_2', 'b_1')).toBeLessThan(0);
    expect(compare_slot_ids('b_1', 'a_2')).toBeGreaterThan(0);
    expect(compare_slot_ids('alpha', 'beta')).toBeLessThan(0);
    expect(compare_slot_ids('alpha', 'alpha')).toBe(0);
  });

  it('is deterministic for equal numeric values with different spelling', () => {
    expect(compare_slot_ids('slot_01', 'slot_1')).not.toBe(0);
    expect(compare_slot_ids('slot_1', 'slot_1')).toBe(0);
  });
});
