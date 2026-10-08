import { describe, expect, it } from 'vitest';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { ConsentStatus } from '../../enums/consent_status.enum.js';
import { CreateContactOutcome } from '../../enums/create_contact_outcome.enum.js';
import { IContactStore } from '../../ports/contact_store.interface.js';
import { make_contract_contact } from './make_contract_contact.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

const ALL = { consent_status: null, limit: 1000 } as const;

/**
 * Registers the behavioural contract every `IContactStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_contact_store_contract(label: string, make: () => IContactStore): void {
  describe(`${label} contact store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('create_contact, get_contact and find_contacts', () => {
      it('round-trips every field', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const contact = make_contract_contact(tenant_id, 'c1', {
          display_name: 'Zoë "Z" Müller, Jr.',
          email_address: 'zoe+games@example.com',
          consent_status: ConsentStatus.UNSUBSCRIBED,
          consent_updated_at: 1786234970000,
          unsubscribed_at: 1786234970000,
          created_at: 1786234960000,
          updated_at: 1786234970000,
          updated_by: 'someone',
        });

        expect(await store.create_contact(contact)).toBe(CreateContactOutcome.CREATED);

        expect(await store.get_contact(tenant_id, 'c1')).toEqual(contact);
      });

      it('round-trips null consent timestamps', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const contact = make_contract_contact(tenant_id, 'c1', { consent_updated_at: null });

        await store.create_contact(contact);

        expect(await store.get_contact(tenant_id, 'c1')).toEqual(contact);
      });

      it('refuses a second contact with the same address, ignoring case, and keeps the first', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const first = make_contract_contact(tenant_id, 'c1', { email_address: 'sam@example.com' });
        await store.create_contact(first);

        const outcome = await store.create_contact(
          make_contract_contact(tenant_id, 'c2', {
            email_address: 'SAM@Example.com',
            display_name: 'Impostor',
          }),
        );

        expect(outcome).toBe(CreateContactOutcome.EMAIL_EXISTS);
        expect(await store.get_contact(tenant_id, 'c2')).toBeNull();
        expect(await store.get_contact(tenant_id, 'c1')).toEqual(first);
      });

      it('never re-subscribes an unsubscribed contact through a duplicate', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(
          make_contract_contact(tenant_id, 'c1', {
            email_address: 'sam@example.com',
            consent_status: ConsentStatus.UNSUBSCRIBED,
            unsubscribed_at: 5,
          }),
        );

        const outcome = await store.create_contact(
          make_contract_contact(tenant_id, 'c2', { email_address: 'sam@example.com' }),
        );

        expect(outcome).toBe(CreateContactOutcome.EMAIL_EXISTS);
        expect((await store.get_contact(tenant_id, 'c1'))?.consent_status).toBe(
          ConsentStatus.UNSUBSCRIBED,
        );
      });

      it('allows the same address in different tenants', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];

        const a = await store.create_contact(
          make_contract_contact(tenant_a, 'c1', { email_address: 'shared@example.com' }),
        );
        const b = await store.create_contact(
          make_contract_contact(tenant_b, 'c1', { email_address: 'shared@example.com' }),
        );

        expect([a, b]).toEqual([CreateContactOutcome.CREATED, CreateContactOutcome.CREATED]);
      });

      it('lets exactly one of several simultaneous creators of the same address win', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        const outcomes = await Promise.all(
          ['c1', 'c2', 'c3', 'c4'].map((id) =>
            store.create_contact(
              make_contract_contact(tenant_id, id, { email_address: 'race@example.com' }),
            ),
          ),
        );

        expect(outcomes.filter((outcome) => outcome === CreateContactOutcome.CREATED)).toHaveLength(
          1,
        );
        expect(await store.count_contacts(tenant_id)).toBe(1);
      });

      it('does not show another tenant a contact', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(make_contract_contact(tenant_a, 'c1'));

        expect(await store.get_contact(tenant_b, 'c1')).toBeNull();
        expect(await store.find_contacts(tenant_b, ['c1'])).toEqual([]);
      });

      it('finds only the requested contacts of the tenant, once each', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(make_contract_contact(tenant_a, 'c1'));
        await store.create_contact(make_contract_contact(tenant_a, 'c2'));
        await store.create_contact(make_contract_contact(tenant_a, 'c3'));
        await store.create_contact(make_contract_contact(tenant_b, 'c4'));

        const found = await store.find_contacts(tenant_a, ['c1', 'c3', 'c1', 'c4', 'nope']);

        expect(found.map((contact) => contact.contact_id).sort()).toEqual(['c1', 'c3']);
      });

      it('finds nothing for an empty id list', async () => {
        const store = make();

        expect(await store.find_contacts(make_contract_tenant_id(), [])).toEqual([]);
      });

      it('does not let a caller change stored values through a returned object', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(make_contract_contact(tenant_id, 'c1'));

        const first = await store.get_contact(tenant_id, 'c1');
        if (first) first.display_name = 'tampered';

        expect((await store.get_contact(tenant_id, 'c1'))?.display_name).toBe('Contact c1');
      });
    });

    describe('list_contacts and count_contacts', () => {
      it('orders by display name ignoring case, then by id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(make_contract_contact(tenant_id, 'c1', { display_name: 'bob' }));
        await store.create_contact(
          make_contract_contact(tenant_id, 'c2', { display_name: 'Alice' }),
        );
        await store.create_contact(
          make_contract_contact(tenant_id, 'c4', { display_name: 'carol' }),
        );
        await store.create_contact(
          make_contract_contact(tenant_id, 'c3', { display_name: 'Carol' }),
        );

        const listed = await store.list_contacts(tenant_id, ALL);

        expect(listed.map((contact) => contact.contact_id)).toEqual(['c2', 'c1', 'c3', 'c4']);
      });

      it('applies the consent filter and the limit', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(make_contract_contact(tenant_id, 'c1', { display_name: 'A' }));
        await store.create_contact(
          make_contract_contact(tenant_id, 'c2', {
            display_name: 'B',
            consent_status: ConsentStatus.UNSUBSCRIBED,
            unsubscribed_at: 1,
          }),
        );
        await store.create_contact(make_contract_contact(tenant_id, 'c3', { display_name: 'C' }));

        const granted = await store.list_contacts(tenant_id, {
          consent_status: ConsentStatus.GRANTED,
          limit: 1000,
        });
        const unsubscribed = await store.list_contacts(tenant_id, {
          consent_status: ConsentStatus.UNSUBSCRIBED,
          limit: 1000,
        });
        const limited = await store.list_contacts(tenant_id, { consent_status: null, limit: 2 });

        expect(granted.map((contact) => contact.contact_id)).toEqual(['c1', 'c3']);
        expect(unsubscribed.map((contact) => contact.contact_id)).toEqual(['c2']);
        expect(limited.map((contact) => contact.contact_id)).toEqual(['c1', 'c2']);
      });

      it('lists and counts only the tenant own contacts', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(make_contract_contact(tenant_a, 'c1'));
        await store.create_contact(make_contract_contact(tenant_a, 'c2'));
        await store.create_contact(make_contract_contact(tenant_b, 'c1'));

        expect(await store.list_contacts(tenant_a, ALL)).toHaveLength(2);
        expect(await store.count_contacts(tenant_a)).toBe(2);
        expect(await store.count_contacts(tenant_b)).toBe(1);
        expect(await store.count_contacts(make_contract_tenant_id())).toBe(0);
      });
    });

    describe('delete_contact', () => {
      it('removes the contact and returns it as it was', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const contact = make_contract_contact(tenant_id, 'c1');
        await store.create_contact(contact);

        expect(await store.delete_contact(tenant_id, 'c1', 9000, 'deleter')).toEqual(contact);

        expect(await store.get_contact(tenant_id, 'c1')).toBeNull();
        expect(await store.delete_contact(tenant_id, 'c1', 9000, 'deleter')).toBeNull();
      });

      it('does not delete another tenant contact', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(make_contract_contact(tenant_a, 'c1'));

        expect(await store.delete_contact(tenant_b, 'c1', 9000, 'deleter')).toBeNull();

        expect(await store.get_contact(tenant_a, 'c1')).not.toBeNull();
      });

      it('lets a deleted contact who had consented be added again', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(
          make_contract_contact(tenant_id, 'c1', { email_address: 'sam@example.com' }),
        );
        await store.delete_contact(tenant_id, 'c1', 9000, 'deleter');

        const outcome = await store.create_contact(
          make_contract_contact(tenant_id, 'c2', { email_address: 'sam@example.com' }),
        );

        expect(outcome).toBe(CreateContactOutcome.CREATED);
      });

      it('keeps an unsubscribe after deletion: the address can never be added again, in any case', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(
          make_contract_contact(tenant_id, 'c1', { email_address: 'sam@example.com' }),
        );
        await store.mark_unsubscribed(tenant_id, 'c1', 5, 'public');
        await store.delete_contact(tenant_id, 'c1', 9000, 'deleter');

        const again = await store.create_contact(
          make_contract_contact(tenant_id, 'c2', { email_address: 'sam@example.com' }),
        );
        const shouting = await store.create_contact(
          make_contract_contact(tenant_id, 'c3', { email_address: 'SAM@EXAMPLE.COM' }),
        );

        expect(again).toBe(CreateContactOutcome.SUPPRESSED);
        expect(shouting).toBe(CreateContactOutcome.SUPPRESSED);
        expect(await store.count_contacts(tenant_id)).toBe(0);
      });

      it('keeps the suppression to the tenant that recorded it', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(
          make_contract_contact(tenant_a, 'c1', { email_address: 'sam@example.com' }),
        );
        await store.mark_unsubscribed(tenant_a, 'c1', 5, 'public');
        await store.delete_contact(tenant_a, 'c1', 9000, 'deleter');

        const other = await store.create_contact(
          make_contract_contact(tenant_b, 'c1', { email_address: 'sam@example.com' }),
        );

        expect(other).toBe(CreateContactOutcome.CREATED);
      });
    });

    describe('mark_unsubscribed', () => {
      it('withdraws consent once and stamps it', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const contact = make_contract_contact(tenant_id, 'c1');
        await store.create_contact(contact);

        const result = await store.mark_unsubscribed(tenant_id, 'c1', 7000, 'public');

        expect(result?.changed).toBe(true);
        expect(result?.before).toEqual(contact);
        expect(result?.contact).toEqual({
          ...contact,
          consent_status: ConsentStatus.UNSUBSCRIBED,
          consent_updated_at: 7000,
          unsubscribed_at: 7000,
          updated_at: 7000,
          updated_by: 'public',
        });
        expect(await store.get_contact(tenant_id, 'c1')).toEqual(result?.contact);
      });

      it('is idempotent and keeps the first unsubscribe time', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(make_contract_contact(tenant_id, 'c1'));
        await store.mark_unsubscribed(tenant_id, 'c1', 7000, 'first');

        const second = await store.mark_unsubscribed(tenant_id, 'c1', 9000, 'second');

        expect(second?.changed).toBe(false);
        expect(second?.contact).toMatchObject({
          unsubscribed_at: 7000,
          updated_at: 7000,
          updated_by: 'first',
        });
      });

      it('lets exactly one of several simultaneous calls change the contact', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_contact(make_contract_contact(tenant_id, 'c1'));

        const results = await Promise.all(
          [1, 2, 3, 4].map((n) => store.mark_unsubscribed(tenant_id, 'c1', 1000 * n, `a${n}`)),
        );

        expect(results.filter((result) => result?.changed)).toHaveLength(1);
        const stored = await store.get_contact(tenant_id, 'c1');
        expect(stored?.consent_status).toBe(ConsentStatus.UNSUBSCRIBED);
      });

      it('returns null for an unknown contact and for another tenant contact', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_contact(make_contract_contact(tenant_a, 'c1'));

        expect(await store.mark_unsubscribed(tenant_a, 'nope', 1, 'x')).toBeNull();
        expect(await store.mark_unsubscribed(tenant_b, 'c1', 1, 'x')).toBeNull();
        expect((await store.get_contact(tenant_a, 'c1'))?.consent_status).toBe(
          ConsentStatus.GRANTED,
        );
      });
    });
  });
}
