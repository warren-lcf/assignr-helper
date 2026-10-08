import { describe, expect, it } from 'vitest';
import { QUICK_LINK_LIMITS } from '../quick_links/quick_link_limits.constant.js';
import { build_quick_link_scope } from './build_quick_link_scope.js';
import { make_contract_filters } from './stores/contracts/make_contract_draft.js';

describe('build_quick_link_scope', () => {
  it('is unrestricted when the filters name nothing expressible', () => {
    expect(
      build_quick_link_scope(
        make_contract_filters({ league: 'Spring', search: 'x', location_group: 'Complex' }),
      ),
    ).toEqual({ organization_ids: [], levels: [], date_start: null, date_end: null });
  });

  it('carries over the organization and level', () => {
    expect(
      build_quick_link_scope(make_contract_filters({ organization_id: 'org-1', level: 'U12' })),
    ).toEqual({ organization_ids: ['org-1'], levels: ['U12'], date_start: null, date_end: null });
  });

  it('rounds the date window down to whole UTC days', () => {
    const scope = build_quick_link_scope(
      make_contract_filters({
        date_from: Date.UTC(2027, 0, 5, 18, 30),
        date_to: Date.UTC(2027, 0, 20, 23, 59),
      }),
    );

    expect(scope.date_start).toBe(Date.UTC(2027, 0, 5));
    expect(scope.date_end).toBe(Date.UTC(2027, 0, 20));
  });

  it('keeps a window that starts and ends on the same day', () => {
    const scope = build_quick_link_scope(
      make_contract_filters({
        date_from: Date.UTC(2027, 0, 5, 8),
        date_to: Date.UTC(2027, 0, 5, 20),
      }),
    );

    expect(scope.date_start).toBe(Date.UTC(2027, 0, 5));
    expect(scope.date_end).toBe(Date.UTC(2027, 0, 5));
  });

  it('allows an open-ended window', () => {
    const scope = build_quick_link_scope(
      make_contract_filters({ date_from: Date.UTC(2027, 0, 5, 8) }),
    );

    expect(scope.date_start).toBe(Date.UTC(2027, 0, 5));
    expect(scope.date_end).toBeNull();
  });

  it('drops a window the quick-link rules would refuse rather than fail', () => {
    const scope = build_quick_link_scope(
      make_contract_filters({ date_from: QUICK_LINK_LIMITS.MAX_SCOPE_DATE + 2 * 86_400_000 }),
    );

    expect(scope.date_start).toBeNull();
    expect(scope.date_end).toBeNull();
  });
});
