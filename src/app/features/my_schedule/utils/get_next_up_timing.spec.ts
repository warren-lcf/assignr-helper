import { NextUpTiming } from '../enums/next_up_timing.enum';
import { get_next_up_timing } from './get_next_up_timing';

describe('get_next_up_timing', () => {
  it('is upcoming before kick-off', () => {
    expect(get_next_up_timing({ start_at: 2_000 }, 1_000)).toBe(NextUpTiming.UPCOMING);
  });

  it('is in progress from the moment of kick-off', () => {
    expect(get_next_up_timing({ start_at: 1_000 }, 1_000)).toBe(NextUpTiming.IN_PROGRESS);
    expect(get_next_up_timing({ start_at: 500 }, 1_000)).toBe(NextUpTiming.IN_PROGRESS);
  });
});
