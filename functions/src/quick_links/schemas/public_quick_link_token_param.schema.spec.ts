import { describe, expect, it } from 'vitest';
import { generate_quick_link_token } from '../../domain/quick_links/generate_quick_link_token.js';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { public_quick_link_token_param_schema } from './public_quick_link_token_param.schema.js';

describe('public quick link token param schema', () => {
  it('accepts a token the generator makes', () => {
    const token = generate_quick_link_token();

    expect(parse_with_schema(public_quick_link_token_param_schema, { token }).ok).toBe(true);
  });

  it.each([
    ['too short', 'a'.repeat(42)],
    ['too long', 'a'.repeat(44)],
    ['empty', ''],
    ['padded base64', `${'a'.repeat(42)}=`],
    ['outside the alphabet', `${'a'.repeat(42)}+`],
    ['with a slash', `${'a'.repeat(42)}/`],
    ['with a space', `${'a'.repeat(42)} `],
    ['with a null byte', `${'a'.repeat(42)}\u0000`],
    ['with injection', "' OR 1=1 --".padEnd(43, 'a')],
  ])('rejects a token that is %s', (_name, token) => {
    expect(parse_with_schema(public_quick_link_token_param_schema, { token }).ok).toBe(false);
  });
});
