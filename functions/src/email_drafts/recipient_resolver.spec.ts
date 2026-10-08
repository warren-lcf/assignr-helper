import { describe, expect, it } from 'vitest';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { InMemoryContactStore } from '../contacts/stores/in_memory_contact_store.js';
import { make_contract_contact } from '../contacts/stores/contracts/make_contract_contact.js';
import { RecipientMode } from './enums/recipient_mode.enum.js';
import { RecipientResolver } from './recipient_resolver.js';

const UNSUBSCRIBED = { consent_status: ConsentStatus.UNSUBSCRIBED, unsubscribed_at: 5 };

/**
 * Builds a store with a few contacts in tenant t1 and one in t2.
 * @returns The store.
 */
async function seeded_store() {
  const store = new InMemoryContactStore();
  await store.create_contact(make_contract_contact('t1', 'c1', { display_name: 'Zed' }));
  await store.create_contact(make_contract_contact('t1', 'c2', { display_name: 'amy' }));
  await store.create_contact(
    make_contract_contact('t1', 'c3', { display_name: 'Bob', ...UNSUBSCRIBED }),
  );
  await store.create_contact(make_contract_contact('t1', 'c4', { display_name: 'Cy' }));
  await store.create_contact(make_contract_contact('t2', 'c9', { display_name: 'Other tenant' }));
  return store;
}

describe('RecipientResolver', () => {
  it('ALL_CONSENTED: every granted contact of the tenant in name order, counting the unsubscribed', async () => {
    const resolver = new RecipientResolver(await seeded_store());

    const resolved = await resolver.resolve('t1', {
      recipient_mode: RecipientMode.ALL_CONSENTED,
      contact_ids: [],
    });

    expect(resolved.eligible.map((c) => c.contact_id)).toEqual(['c2', 'c4', 'c1']);
    expect(resolved.unsubscribed_count).toBe(1);
    expect(resolved.skipped_unsubscribed).toEqual([]);
    expect(resolved.missing_count).toBe(0);
  });

  it('ALL_CONSENTED: ignores any contact ids the draft carries', async () => {
    const resolver = new RecipientResolver(await seeded_store());

    const resolved = await resolver.resolve('t1', {
      recipient_mode: RecipientMode.ALL_CONSENTED,
      contact_ids: ['c1'],
    });

    expect(resolved.eligible).toHaveLength(3);
  });

  it('SELECTED: only the chosen granted contacts, reporting unsubscribed and missing ones', async () => {
    const resolver = new RecipientResolver(await seeded_store());

    const resolved = await resolver.resolve('t1', {
      recipient_mode: RecipientMode.SELECTED,
      contact_ids: ['c1', 'c3', 'c3', 'gone'],
    });

    expect(resolved.eligible.map((c) => c.contact_id)).toEqual(['c1']);
    expect(resolved.skipped_unsubscribed.map((c) => c.contact_id)).toEqual(['c3']);
    expect(resolved.unsubscribed_count).toBe(1);
    expect(resolved.missing_count).toBe(1);
  });

  it('SELECTED: never reaches another tenant contact, even by id', async () => {
    const resolver = new RecipientResolver(await seeded_store());

    const resolved = await resolver.resolve('t1', {
      recipient_mode: RecipientMode.SELECTED,
      contact_ids: ['c9'],
    });

    expect(resolved.eligible).toEqual([]);
    expect(resolved.missing_count).toBe(1);
  });

  it('SELECTED with nobody chosen resolves to nobody', async () => {
    const resolver = new RecipientResolver(await seeded_store());

    const resolved = await resolver.resolve('t1', {
      recipient_mode: RecipientMode.SELECTED,
      contact_ids: [],
    });

    expect(resolved).toEqual({
      eligible: [],
      skipped_unsubscribed: [],
      unsubscribed_count: 0,
      missing_count: 0,
    });
  });
});
