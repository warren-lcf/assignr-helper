import { describe, expect, it } from 'vitest';
import { draft_id_param_schema } from './draft_id_param.schema.js';
import { send_draft_body_schema } from './send_draft_body.schema.js';

describe('send_draft_body_schema', () => {
  it.each([0, 1, 100, 500])('accepts a confirmed count of %s', (confirm_recipient_count) => {
    expect(send_draft_body_schema.parse({ confirm_recipient_count })).toEqual({
      confirm_recipient_count,
    });
  });

  it.each([-1, 1.5, '3', null, undefined, 2_000_000, Number.NaN])(
    'rejects a confirmed count of %j',
    (confirm_recipient_count) => {
      expect(send_draft_body_schema.safeParse({ confirm_recipient_count }).success).toBe(false);
    },
  );

  it('rejects unknown fields', () => {
    expect(
      send_draft_body_schema.safeParse({ confirm_recipient_count: 1, recipients: ['a@b.co'] })
        .success,
    ).toBe(false);
  });
});

describe('draft_id_param_schema', () => {
  it('accepts an id and rejects anything else', () => {
    expect(draft_id_param_schema.safeParse({ draft_id: 'd-1_A' }).success).toBe(true);
    expect(draft_id_param_schema.safeParse({ draft_id: 'a b' }).success).toBe(false);
    expect(draft_id_param_schema.safeParse({ draft_id: '' }).success).toBe(false);
    expect(draft_id_param_schema.safeParse({ draft_id: 'd1', extra: 1 }).success).toBe(false);
  });
});
