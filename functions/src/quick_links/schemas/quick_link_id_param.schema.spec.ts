import { describe, expect, it } from 'vitest';
import { parse_with_schema } from '../../http/parse_with_schema.js';
import { quick_link_id_param_schema } from './quick_link_id_param.schema.js';

describe('quick link id param schema', () => {
  it('accepts ids made of letters, digits, - and _', () => {
    expect(parse_with_schema(quick_link_id_param_schema, { link_id: 'ab-12_X' }).ok).toBe(true);
  });

  it.each([[''], ['a'.repeat(65)], ['a b'], ["a'b"], ['a/b']])('rejects %j', (link_id) => {
    expect(parse_with_schema(quick_link_id_param_schema, { link_id }).ok).toBe(false);
  });
});
