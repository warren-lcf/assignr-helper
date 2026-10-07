import { describe, expect, it } from 'vitest';
import { QuickLinkState } from '../../domain/quick_links/quick_link_state.enum.js';
import { make_contract_quick_link } from '../stores/contracts/make_contract_quick_link.js';
import { to_quick_link_view } from './to_quick_link_view.js';

describe('to_quick_link_view', () => {
  it('exposes exactly the allow-listed fields and never the token hash, tenant or stamps', () => {
    const link = make_contract_quick_link('t1', 'l1', {
      scope: { organization_ids: ['o1'], levels: ['U12'], date_start: 1, date_end: 2 },
      expires_at: 9000,
      last_viewed_at: 500,
      view_count: 4,
      created_at: 100,
      email_draft_id: 'draft-1',
    });

    const view = to_quick_link_view(link, 1000);

    expect(view).toEqual({
      link_id: 'l1',
      scope: { organization_ids: ['o1'], levels: ['U12'], date_start: 1, date_end: 2 },
      state: QuickLinkState.ACTIVE,
      expires_at: 9000,
      revoked_at: null,
      last_viewed_at: 500,
      view_count: 4,
      created_at: 100,
    });
    expect(JSON.stringify(view)).not.toContain(link.token_hash);
    expect(Object.keys(view).sort()).toEqual([
      'created_at',
      'expires_at',
      'last_viewed_at',
      'link_id',
      'revoked_at',
      'scope',
      'state',
      'view_count',
    ]);
  });

  it('reports EXPIRED once the expiry has passed', () => {
    const link = make_contract_quick_link('t1', 'l1', { expires_at: 1000 });

    expect(to_quick_link_view(link, 999).state).toBe(QuickLinkState.ACTIVE);
    expect(to_quick_link_view(link, 1000).state).toBe(QuickLinkState.EXPIRED);
  });

  it('reports REVOKED even when it has also expired', () => {
    const link = make_contract_quick_link('t1', 'l1', { expires_at: 10, revoked_at: 5 });

    const view = to_quick_link_view(link, 1000);

    expect(view.state).toBe(QuickLinkState.REVOKED);
    expect(view.revoked_at).toBe(5);
  });

  it('copies the scope so the view cannot change the stored link', () => {
    const link = make_contract_quick_link('t1', 'l1');

    to_quick_link_view(link, 1).scope.levels.push('mutated');

    expect(link.scope.levels).toEqual([]);
  });
});
