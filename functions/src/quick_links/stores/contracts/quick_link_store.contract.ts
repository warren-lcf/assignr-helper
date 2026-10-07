import { describe, expect, it } from 'vitest';
import { hash_quick_link_token } from '../../../domain/quick_links/hash_quick_link_token.js';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { IQuickLinkStore } from '../../ports/quick_link_store.interface.js';
import { make_contract_quick_link } from './make_contract_quick_link.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Registers the behavioural contract every `IQuickLinkStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_quick_link_store_contract(
  label: string,
  make: () => IQuickLinkStore,
): void {
  describe(`${label} quick link store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('create_link, get_link and find_by_token_hash', () => {
      it('round-trips every field including the scope', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const link = make_contract_quick_link(tenant_id, 'l1', {
          scope: {
            organization_ids: ['org-1', 'org_2'],
            levels: ['Premier "A"', 'U12, Girls', 'Élite'],
            date_start: Date.UTC(2026, 9, 1),
            date_end: Date.UTC(2026, 9, 31),
          },
          expires_at: 1786234975000,
          revoked_at: 1786234976000,
          last_viewed_at: 1786234977000,
          view_count: 7,
          email_draft_id: 'draft-1',
          created_at: 1786234970000,
          created_by: 'creator',
          updated_at: 1786234980000,
          updated_by: 'updater',
        });

        await store.create_link(link);

        expect(await store.get_link(tenant_id, 'l1')).toEqual(link);
      });

      it('round-trips null optional fields and an unrestricted scope', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const link = make_contract_quick_link(tenant_id, 'l1');

        await store.create_link(link);

        const stored = await store.get_link(tenant_id, 'l1');
        expect(stored).toEqual(link);
        expect(stored?.expires_at).toBeNull();
        expect(stored?.last_viewed_at).toBeNull();
        expect(stored?.view_count).toBe(0);
      });

      it('returns null for an unknown link', async () => {
        const store = make();

        expect(await store.get_link(make_contract_tenant_id(), 'nope')).toBeNull();
      });

      it('stores a copy of the created link and returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const link = make_contract_quick_link(tenant_id, 'l1');
        await store.create_link(link);

        link.scope.levels.push('mutated');
        const first = await store.get_link(tenant_id, 'l1');
        first!.scope.organization_ids.push('mutated');
        const [listed] = await store.list_links(tenant_id);
        listed!.scope.levels.push('mutated');

        const again = await store.get_link(tenant_id, 'l1');
        expect(again?.scope).toEqual({
          organization_ids: [],
          levels: [],
          date_start: null,
          date_end: null,
        });
      });

      it('finds a link by the hash of its token, across tenants', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const token_hash = hash_quick_link_token(`token-${tenant_id}`);
        await store.create_link(make_contract_quick_link(tenant_id, 'l1', { token_hash }));

        const found = await store.find_by_token_hash(token_hash);

        expect(found).toMatchObject({ tenant_id, link_id: 'l1', token_hash });
      });

      it('finds nothing for a hash no link has', async () => {
        const store = make();

        expect(await store.find_by_token_hash(hash_quick_link_token('nobody-has-this'))).toBeNull();
      });

      it('rejects a second link with the same id in the tenant', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        await expect(
          store.create_link(
            make_contract_quick_link(tenant_id, 'l1', {
              token_hash: hash_quick_link_token(`other-${tenant_id}`),
            }),
          ),
        ).rejects.toThrow();
      });

      it('rejects a second link with the same token hash, even in another tenant', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        const token_hash = hash_quick_link_token(`shared-${tenant_a}`);
        await store.create_link(make_contract_quick_link(tenant_a, 'l1', { token_hash }));

        await expect(
          store.create_link(make_contract_quick_link(tenant_b, 'l2', { token_hash })),
        ).rejects.toThrow();
        expect(await store.get_link(tenant_b, 'l2')).toBeNull();
      });

      it('keeps the same link id separate per tenant', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_a, 'l1', { created_by: 'a' }));
        await store.create_link(make_contract_quick_link(tenant_b, 'l1', { created_by: 'b' }));

        expect((await store.get_link(tenant_a, 'l1'))?.created_by).toBe('a');
        expect((await store.get_link(tenant_b, 'l1'))?.created_by).toBe('b');
      });
    });

    describe('list_links', () => {
      it("lists only the tenant's links, newest first", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'old', { created_at: 1000 }));
        await store.create_link(make_contract_quick_link(tenant_id, 'new', { created_at: 3000 }));
        await store.create_link(make_contract_quick_link(tenant_id, 'mid', { created_at: 2000 }));
        await store.create_link(make_contract_quick_link(other_tenant_id, 'other'));

        const links = await store.list_links(tenant_id);

        expect(links.map((link) => link.link_id)).toEqual(['new', 'mid', 'old']);
      });

      it('orders links created at the same instant by link id, descending', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        for (const link_id of ['a', 'c', 'b']) {
          await store.create_link(make_contract_quick_link(tenant_id, link_id, { created_at: 5 }));
        }

        const links = await store.list_links(tenant_id);

        expect(links.map((link) => link.link_id)).toEqual(['c', 'b', 'a']);
      });

      it('returns an empty list for a tenant with no links', async () => {
        const store = make();

        expect(await store.list_links(make_contract_tenant_id())).toEqual([]);
      });
    });

    describe('revoke_link', () => {
      it('sets revoked_at and the update stamp, once', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        const result = await store.revoke_link(tenant_id, 'l1', 5000, 'revoker');

        expect(result?.revoked_now).toBe(true);
        expect(result?.link).toMatchObject({
          revoked_at: 5000,
          updated_at: 5000,
          updated_by: 'revoker',
          created_by: 'creator',
        });
        expect(await store.get_link(tenant_id, 'l1')).toEqual(result?.link);
      });

      it('is idempotent: a second revoke keeps the first time and reports nothing changed', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));
        await store.revoke_link(tenant_id, 'l1', 5000, 'first');

        const again = await store.revoke_link(tenant_id, 'l1', 9000, 'second');

        expect(again?.revoked_now).toBe(false);
        expect(again?.link).toMatchObject({ revoked_at: 5000, updated_by: 'first' });
      });

      it('lets exactly one of two simultaneous revokes win', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        const results = await Promise.all([
          store.revoke_link(tenant_id, 'l1', 5000, 'a'),
          store.revoke_link(tenant_id, 'l1', 6000, 'b'),
        ]);

        expect(results.filter((result) => result?.revoked_now).length).toBe(1);
        const stored = await store.get_link(tenant_id, 'l1');
        expect([5000, 6000]).toContain(stored?.revoked_at);
      });

      it("returns null for an unknown link and never revokes another tenant's link", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        expect(await store.revoke_link(other_tenant_id, 'l1', 5000, 'x')).toBeNull();
        expect(await store.revoke_link(tenant_id, 'nope', 5000, 'x')).toBeNull();
        expect((await store.get_link(tenant_id, 'l1'))?.revoked_at).toBeNull();
      });
    });

    describe('record_view', () => {
      it('counts views and remembers the latest one', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        expect(await store.record_view(tenant_id, 'l1', 2000)).toBe(true);
        expect(await store.record_view(tenant_id, 'l1', 3000)).toBe(true);

        const stored = await store.get_link(tenant_id, 'l1');
        expect(stored).toMatchObject({ view_count: 2, last_viewed_at: 3000 });
      });

      it('never moves last_viewed_at backwards', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));
        await store.record_view(tenant_id, 'l1', 9000);

        await store.record_view(tenant_id, 'l1', 4000);

        expect(await store.get_link(tenant_id, 'l1')).toMatchObject({
          view_count: 2,
          last_viewed_at: 9000,
        });
      });

      it('leaves the audit stamps alone', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const link = make_contract_quick_link(tenant_id, 'l1');
        await store.create_link(link);

        await store.record_view(tenant_id, 'l1', 2000);

        expect(await store.get_link(tenant_id, 'l1')).toMatchObject({
          updated_at: link.updated_at,
          updated_by: link.updated_by,
        });
      });

      it('counts every one of several simultaneous views', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        await Promise.all([1, 2, 3, 4, 5].map((n) => store.record_view(tenant_id, 'l1', n * 1000)));

        expect(await store.get_link(tenant_id, 'l1')).toMatchObject({
          view_count: 5,
          last_viewed_at: 5000,
        });
      });

      it("returns false for an unknown link and never touches another tenant's link", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.create_link(make_contract_quick_link(tenant_id, 'l1'));

        expect(await store.record_view(other_tenant_id, 'l1', 2000)).toBe(false);
        expect(await store.record_view(tenant_id, 'nope', 2000)).toBe(false);
        expect((await store.get_link(tenant_id, 'l1'))?.view_count).toBe(0);
      });
    });
  });
}
