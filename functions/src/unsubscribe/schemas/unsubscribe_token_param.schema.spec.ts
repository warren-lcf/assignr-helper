import { describe, expect, it } from 'vitest';
import { unsubscribe_token_param_schema } from './unsubscribe_token_param.schema.js';

const valid = 'A'.repeat(120);

describe('unsubscribe_token_param_schema', () => {
  it('accepts base64url text of a plausible length', () => {
    expect(unsubscribe_token_param_schema.safeParse({ token: valid }).success).toBe(true);
    expect(unsubscribe_token_param_schema.safeParse({ token: 'a-_Z9'.repeat(10) }).success).toBe(
      true,
    );
  });

  it.each([
    '',
    'short',
    'A'.repeat(47),
    'A'.repeat(257),
    `${'A'.repeat(60)}=`,
    `${'A'.repeat(60)}/`,
    `${'A'.repeat(60)} `,
    `${'A'.repeat(60)}%00`,
    `../${'A'.repeat(60)}`,
  ])('rejects %j', (token) => {
    expect(unsubscribe_token_param_schema.safeParse({ token }).success).toBe(false);
  });

  it('rejects unknown params', () => {
    expect(unsubscribe_token_param_schema.safeParse({ token: valid, extra: 1 }).success).toBe(
      false,
    );
  });
});
