import { format_duration } from './format_duration';

describe('format_duration', () => {
  it('shows an en dash while there is no duration', () => {
    expect(format_duration(null)).toBe('\u2013');
  });

  it('shows milliseconds under a second', () => {
    expect(format_duration(340)).toContain('340');
    expect(format_duration(0)).toContain('0');
  });

  it('shows seconds with at most one decimal under a minute', () => {
    expect(format_duration(1200)).toContain('1.2');
    expect(format_duration(12_000)).toContain('12');
  });

  it('shows minutes and seconds from a minute up', () => {
    const text = format_duration(125_000);

    expect(text).toContain('2');
    expect(text).toContain('5');
  });

  it('shows whole minutes without a seconds part', () => {
    expect(format_duration(120_000)).not.toContain('0s');
    expect(format_duration(120_000)).toContain('2');
  });
});
