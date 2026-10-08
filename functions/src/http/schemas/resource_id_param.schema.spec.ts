import { describe, expect, it } from 'vitest';
import { resource_id_schema } from './resource_id_param.schema.js';

describe('resource_id_schema', () => {
  it.each(['a', 'c0ffee00-1111-2222-3333-444455556666', 'A_b-9', 'x'.repeat(64)])(
    'accepts %s',
    (value) => {
      expect(resource_id_schema.safeParse(value).success).toBe(true);
    },
  );

  it.each(['', 'x'.repeat(65), 'a b', 'a/b', 'a:b', '../x', 'a\nb', 5, null])(
    'refuses %j',
    (value) => {
      expect(resource_id_schema.safeParse(value).success).toBe(false);
    },
  );
});
