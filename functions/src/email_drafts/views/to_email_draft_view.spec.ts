import { describe, expect, it } from 'vitest';
import { make_contract_draft } from '../stores/contracts/make_contract_draft.js';
import { to_email_draft_view } from './to_email_draft_view.js';

describe('to_email_draft_view', () => {
  it('shows exactly the contract fields', () => {
    const view = to_email_draft_view(make_contract_draft('t1', 'd1', { quick_link_id: 'ql-1' }));

    expect(Object.keys(view).sort()).toEqual([
      'contact_ids',
      'created_at',
      'draft_id',
      'filters',
      'include_quick_link',
      'intro',
      'quick_link_expiry_days',
      'recipient_count',
      'recipient_mode',
      'sent_at',
      'status',
      'subject',
      'updated_at',
    ]);
  });

  it('copies the lists so the view can not change the stored draft', () => {
    const draft = make_contract_draft('t1', 'd1', { contact_ids: ['c1'] });

    const view = to_email_draft_view(draft);
    view.contact_ids.push('c2');
    view.filters.search = 'x';

    expect(draft.contact_ids).toEqual(['c1']);
    expect(draft.filters.search).toBeNull();
  });
});
