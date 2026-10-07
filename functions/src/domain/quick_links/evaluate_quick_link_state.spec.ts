import { describe, expect, it } from 'vitest';
import { evaluate_quick_link_state } from './evaluate_quick_link_state.js';
import { IQuickLinkRecord } from './quick_link_record.model.js';
import { QuickLinkState } from './quick_link_state.enum.js';

function make_record(overrides: Partial<IQuickLinkRecord> = {}): IQuickLinkRecord {
  return {
    link_id: 'l1',
    tenant_id: 't1',
    token_hash: 'h',
    scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
    expires_at: null,
    revoked_at: null,
    ...overrides,
  };
}

describe('evaluate_quick_link_state', () => {
  const now = 1_000_000;

  it('is ACTIVE when never expiring and not revoked', () => {
    expect(evaluate_quick_link_state(make_record(), now)).toBe(QuickLinkState.ACTIVE);
  });

  it('is ACTIVE before the expiry instant', () => {
    expect(evaluate_quick_link_state(make_record({ expires_at: now + 1 }), now)).toBe(
      QuickLinkState.ACTIVE,
    );
  });

  it('is EXPIRED exactly at the expiry instant', () => {
    expect(evaluate_quick_link_state(make_record({ expires_at: now }), now)).toBe(
      QuickLinkState.EXPIRED,
    );
  });

  it('is EXPIRED after the expiry instant', () => {
    expect(evaluate_quick_link_state(make_record({ expires_at: now - 1 }), now)).toBe(
      QuickLinkState.EXPIRED,
    );
  });

  it('is REVOKED when revoked', () => {
    expect(evaluate_quick_link_state(make_record({ revoked_at: now - 5 }), now)).toBe(
      QuickLinkState.REVOKED,
    );
  });

  it('lets revocation win over expiry', () => {
    expect(
      evaluate_quick_link_state(make_record({ revoked_at: now - 5, expires_at: now - 10 }), now),
    ).toBe(QuickLinkState.REVOKED);
  });
});
