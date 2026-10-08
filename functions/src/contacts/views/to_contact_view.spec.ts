import { describe, expect, it } from 'vitest';
import { make_contract_contact } from '../stores/contracts/make_contract_contact.js';
import { to_contact_view } from './to_contact_view.js';

describe('to_contact_view', () => {
  it('shows exactly the contract fields and no tenant or audit actors', () => {
    const view = to_contact_view(make_contract_contact('t1', 'c1'));

    expect(Object.keys(view).sort()).toEqual([
      'consent_status',
      'consent_updated_at',
      'contact_id',
      'created_at',
      'display_name',
      'email_address',
      'unsubscribed_at',
    ]);
    expect(view).toMatchObject({ contact_id: 'c1', consent_status: 'GRANTED', created_at: 1000 });
  });
});
