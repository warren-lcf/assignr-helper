import { describe, expect, it } from 'vitest';
import { email_settings_body_schema } from './email_settings_body.schema.js';

describe('email_settings_body_schema', () => {
  it('accepts only the sender', () => {
    expect(email_settings_body_schema.parse({ from_email: 'Desk@Example.com' })).toEqual({
      from_email: 'desk@example.com',
    });
  });

  it('normalises every field', () => {
    expect(
      email_settings_body_schema.parse({
        api_key: ' SG.abc ',
        from_email: 'desk@example.com',
        from_name: ' Desk ',
        reply_to: 'Reply@Example.com',
        postal_address: ' 1 Main St\nSpringfield ',
      }),
    ).toEqual({
      api_key: 'SG.abc',
      from_email: 'desk@example.com',
      from_name: 'Desk',
      reply_to: 'reply@example.com',
      postal_address: '1 Main St\nSpringfield',
    });
  });

  it('turns blank optional text and null into null', () => {
    const parsed = email_settings_body_schema.parse({
      from_email: 'desk@example.com',
      from_name: '  ',
      reply_to: null,
      postal_address: '',
    });

    expect(parsed.from_name).toBeNull();
    expect(parsed.reply_to).toBeNull();
    expect(parsed.postal_address).toBeNull();
  });

  it.each([
    { api_key: 'has space' },
    { api_key: 'new\nline' },
    { api_key: '' },
    { api_key: 'k'.repeat(513) },
    { from_name: 'two\nlines' },
    { from_name: 'x'.repeat(101) },
    { reply_to: 'nope' },
    { postal_address: 'x'.repeat(301) },
    { postal_address: 'bad\u0007char' },
    { unknown_field: 1 },
  ])('rejects %j', (patch) => {
    expect(
      email_settings_body_schema.safeParse({ from_email: 'desk@example.com', ...patch }).success,
    ).toBe(false);
  });

  it('never echoes the API key in an error message', () => {
    const result = email_settings_body_schema.safeParse({
      from_email: 'desk@example.com',
      api_key: 'SG.secret value',
    });

    expect(JSON.stringify(result.error?.issues)).not.toContain('secret');
  });
});
