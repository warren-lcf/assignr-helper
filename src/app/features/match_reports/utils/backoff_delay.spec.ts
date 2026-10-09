import { backoff_delay } from './backoff_delay';

describe('backoff_delay', () => {
  it('waits one second after the first failure and doubles each time', () => {
    expect([1, 2, 3, 4, 5].map(backoff_delay)).toEqual([1000, 2000, 4000, 8000, 16_000]);
  });

  it('never waits more than thirty seconds', () => {
    expect(backoff_delay(6)).toBe(30_000);
    expect(backoff_delay(50)).toBe(30_000);
  });

  it('treats no failures like the first one', () => {
    expect(backoff_delay(0)).toBe(1000);
  });
});
