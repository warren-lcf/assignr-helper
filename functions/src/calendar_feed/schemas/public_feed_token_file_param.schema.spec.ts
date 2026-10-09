import { describe, expect, it } from 'vitest';
import { public_feed_token_file_param_schema } from './public_feed_token_file_param.schema.js';

const TOKEN = 'Ab_-'.repeat(10) + 'xyz';

describe('public_feed_token_file_param_schema', () => {
  it('accepts exactly 43 base64url characters followed by .ics', () => {
    expect(TOKEN).toHaveLength(43);
    expect(
      public_feed_token_file_param_schema.safeParse({ token_file: `${TOKEN}.ics` }).success,
    ).toBe(true);
  });

  it.each([
    ['no extension', TOKEN],
    ['a different extension', `${TOKEN}.txt`],
    ['an upper case extension', `${TOKEN}.ICS`],
    ['a doubled extension', `${TOKEN}.ics.ics`],
    ['a 42 character token', `${TOKEN.slice(1)}.ics`],
    ['a 44 character token', `${TOKEN}a.ics`],
    ['padding', `${TOKEN.slice(1)}=.ics`],
    ['a character outside the alphabet', `${TOKEN.slice(1)}!.ics`],
    ['a slash', `${TOKEN.slice(2)}/a.ics`],
    ['a space', `${TOKEN.slice(1)} .ics`],
    ['a trailing newline', `${TOKEN}.ics\n`],
    ['a dot inside the token', `${TOKEN.slice(1)}..ics`],
    ['nothing before the extension', '.ics'],
    ['an empty string', ''],
  ])('rejects %s', (_case, token_file) => {
    expect(public_feed_token_file_param_schema.safeParse({ token_file }).success).toBe(false);
  });

  it('rejects unknown parameters and a missing token_file', () => {
    expect(
      public_feed_token_file_param_schema.safeParse({ token_file: `${TOKEN}.ics`, extra: 'x' })
        .success,
    ).toBe(false);
    expect(public_feed_token_file_param_schema.safeParse({}).success).toBe(false);
  });
});
