import { compute_default_minute } from './compute_default_minute';

const KICKOFF = Date.UTC(2026, 9, 10, 14, 0, 0);
const MINUTE = 60_000;

describe('compute_default_minute', () => {
  it('is whole minutes since kick-off, rounding down', () => {
    expect(compute_default_minute(KICKOFF, KICKOFF + 34 * MINUTE + 59_000)).toBe(34);
  });

  it('is the first minute at kick-off and before it', () => {
    expect(compute_default_minute(KICKOFF, KICKOFF)).toBe(1);
    expect(compute_default_minute(KICKOFF, KICKOFF - 10 * MINUTE)).toBe(1);
  });

  it('stops at minute 130 however long ago the game began', () => {
    expect(compute_default_minute(KICKOFF, KICKOFF + 130 * MINUTE)).toBe(130);
    expect(compute_default_minute(KICKOFF, KICKOFF + 5_000 * MINUTE)).toBe(130);
  });

  it('is the first minute when the kick-off is not known', () => {
    expect(compute_default_minute(null, KICKOFF)).toBe(1);
  });
});
