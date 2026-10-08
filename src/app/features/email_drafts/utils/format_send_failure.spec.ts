import { format_send_failure } from './format_send_failure';

const translate = (key: string): string => `T(${key})`;

describe('format_send_failure', () => {
  it('maps a known code to its reason', () => {
    expect(format_send_failure('PROVIDER_REJECTED', translate)).toBe(
      'T(The email service refused this message.)',
    );
  });

  it('gives a generic reason for an unknown code, and never the code itself', () => {
    const text = format_send_failure('MYSTERY_42', translate);

    expect(text).toBe('T(The message could not be delivered.)');
    expect(text).not.toContain('MYSTERY');
  });

  it('gives the generic reason when there is no code', () => {
    expect(format_send_failure(null, translate)).toBe('T(The message could not be delivered.)');
  });
});
