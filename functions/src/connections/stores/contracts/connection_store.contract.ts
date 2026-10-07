import { describe, expect, it } from 'vitest';
import { IntegrationProvider } from '../../../integrations/enums/integration_provider.enum.js';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { ConnectionStatus } from '../../enums/connection_status.enum.js';
import { IConnection } from '../../models/connection.model.js';
import { IConnectionStore } from '../../ports/connection_store.interface.js';
import { make_contract_connection } from './make_contract_connection.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/** Large enough to see every row a test created even when a shared table holds older rows. */
const ALL_ROWS_LIMIT = 10_000;

/**
 * Names a connection by tenant and id so rows can be compared irrespective of other tenants.
 * @param connection Connection to name.
 * @returns A `tenant_id/connection_id` label.
 */
function label_of(connection: IConnection): string {
  return `${connection.tenant_id}/${connection.connection_id}`;
}

/**
 * Keeps only the connections owned by the given tenants and names them.
 * `list_syncable_connections` spans every tenant, so a test must ignore rows it did not create.
 * @param connections Connections returned by the store.
 * @param tenant_ids Tenants created by the calling test.
 * @returns The labels of the calling test's own connections, in the store's order.
 */
function labels_of_mine(connections: IConnection[], tenant_ids: string[]): string[] {
  return connections.filter((c) => tenant_ids.includes(c.tenant_id)).map(label_of);
}

/**
 * Tells whether a list follows the syncable order: never-synced first, then oldest first,
 * ties by tenant then connection id.
 * @param connections Connections in the order the store returned them.
 * @returns True when every adjacent pair is correctly ordered.
 */
function is_in_sync_order(connections: IConnection[]): boolean {
  return connections.every((current, index) => {
    const previous = connections[index - 1];
    if (!previous) {
      return true;
    }
    if (previous.last_sync_at !== current.last_sync_at) {
      return previous.last_sync_at === null
        ? true
        : current.last_sync_at !== null && previous.last_sync_at < current.last_sync_at;
    }
    if (previous.tenant_id !== current.tenant_id) {
      return previous.tenant_id < current.tenant_id;
    }
    return previous.connection_id <= current.connection_id;
  });
}

/**
 * Registers the behavioural contract every `IConnectionStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * `list_syncable_connections` is cross-tenant, so those tests assert only on their own rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_connection_store_contract(
  label: string,
  make: () => IConnectionStore,
): void {
  describe(`${label} connection store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('save_connection and get_connection', () => {
      it('round-trips every field including scopes', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const connection = make_contract_connection(tenant_id, 'c1', {
          provider: IntegrationProvider.ASSIGNR,
          status: ConnectionStatus.NEEDS_ATTENTION,
          account_label: 'Metro "Referees" é',
          external_account_id: 'ext-42',
          secret_ref: 'projects/p/secrets/s/versions/1',
          scopes: ['read', 'write "all"', 'a,b'],
          last_sync_at: 1786234975000,
          last_error: 'Token expired: line one\nline two',
          created_at: 1786234970000,
          created_by: 'creator',
          updated_at: 1786234980000,
          updated_by: 'updater',
        });

        await store.save_connection(connection);

        expect(await store.get_connection(tenant_id, 'c1')).toEqual(connection);
      });

      it('round-trips null optional fields and empty scopes', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const connection = make_contract_connection(tenant_id, 'c1');

        await store.save_connection(connection);

        const stored = await store.get_connection(tenant_id, 'c1');
        expect(stored).toEqual(connection);
        expect(stored?.scopes).toEqual([]);
        expect(stored?.last_sync_at).toBeNull();
      });

      it('returns null for an unknown connection', async () => {
        const store = make();

        expect(await store.get_connection(make_contract_tenant_id(), 'nope')).toBeNull();
      });

      it('replaces a connection with the same key and clears fields set to null', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', {
            account_label: 'Before',
            scopes: ['read'],
            last_sync_at: 5000,
            last_error: 'boom',
          }),
        );
        const replacement = make_contract_connection(tenant_id, 'c1', {
          status: ConnectionStatus.DISCONNECTED,
          account_label: null,
          scopes: [],
          last_sync_at: null,
          last_error: null,
          updated_at: 2000,
          updated_by: 'later',
        });
        await store.save_connection(replacement);

        expect(await store.get_connection(tenant_id, 'c1')).toEqual(replacement);
        expect(await store.list_connections(tenant_id)).toHaveLength(1);
      });

      it('stores a copy of the saved connection', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const connection = make_contract_connection(tenant_id, 'c1', { scopes: ['read'] });
        await store.save_connection(connection);

        connection.status = ConnectionStatus.DISCONNECTED;
        connection.scopes.push('mutated');

        const stored = await store.get_connection(tenant_id, 'c1');
        expect(stored?.status).toBe(ConnectionStatus.CONNECTED);
        expect(stored?.scopes).toEqual(['read']);
      });

      it('returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', { scopes: ['read'] }),
        );

        const first = await store.get_connection(tenant_id, 'c1');
        first!.scopes.push('mutated');
        first!.status = ConnectionStatus.DISCONNECTED;
        const [listed] = await store.list_connections(tenant_id);
        listed!.scopes.push('mutated');

        const again = await store.get_connection(tenant_id, 'c1');
        expect(again?.scopes).toEqual(['read']);
        expect(again?.status).toBe(ConnectionStatus.CONNECTED);
      });

      it('keeps the same connection id separate per tenant', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_a, 'c1', { account_label: 'A' }),
        );
        await store.save_connection(
          make_contract_connection(tenant_b, 'c1', { account_label: 'B' }),
        );

        expect((await store.get_connection(tenant_a, 'c1'))?.account_label).toBe('A');
        expect((await store.get_connection(tenant_b, 'c1'))?.account_label).toBe('B');
      });
    });

    describe('tenant isolation', () => {
      it("does not return another tenant's connection from get_connection", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'c1'));

        expect(await store.get_connection(other_tenant_id, 'c1')).toBeNull();
      });

      it("lists only the requested tenant's connections", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'mine'));
        await store.save_connection(make_contract_connection(other_tenant_id, 'theirs'));

        const connections = await store.list_connections(tenant_id);

        expect(connections.map((c) => c.connection_id)).toEqual(['mine']);
      });

      it('returns an empty list for a tenant with no connections', async () => {
        const store = make();

        expect(await store.list_connections(make_contract_tenant_id())).toEqual([]);
      });

      it("does not apply a sync outcome to another tenant's connection", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        const connection = make_contract_connection(tenant_id, 'c1', { last_error: 'keep' });
        await store.save_connection(connection);

        const result = await store.record_sync_outcome(
          other_tenant_id,
          'c1',
          { last_sync_at: 9000, last_error: null, status: ConnectionStatus.DISCONNECTED },
          'actor',
          9000,
        );

        expect(result).toBeNull();
        expect(await store.get_connection(tenant_id, 'c1')).toEqual(connection);
        expect(await store.get_connection(other_tenant_id, 'c1')).toBeNull();
      });
    });

    describe('list_connections', () => {
      it('orders by account label with unlabelled connections last, then by connection id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'n2'));
        await store.save_connection(
          make_contract_connection(tenant_id, 'b2', { account_label: 'Bravo' }),
        );
        await store.save_connection(
          make_contract_connection(tenant_id, 'a1', { account_label: 'Alpha' }),
        );
        await store.save_connection(make_contract_connection(tenant_id, 'n1'));
        await store.save_connection(
          make_contract_connection(tenant_id, 'b1', { account_label: 'Bravo' }),
        );

        const connections = await store.list_connections(tenant_id);

        expect(connections.map((c) => c.connection_id)).toEqual(['a1', 'b1', 'b2', 'n1', 'n2']);
      });

      it('returns every status', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'c1'));
        await store.save_connection(
          make_contract_connection(tenant_id, 'c2', { status: ConnectionStatus.NEEDS_ATTENTION }),
        );
        await store.save_connection(
          make_contract_connection(tenant_id, 'c3', { status: ConnectionStatus.DISCONNECTED }),
        );

        const connections = await store.list_connections(tenant_id);

        expect(connections.map((c) => c.status)).toEqual([
          ConnectionStatus.CONNECTED,
          ConnectionStatus.NEEDS_ATTENTION,
          ConnectionStatus.DISCONNECTED,
        ]);
      });
    });

    describe('list_syncable_connections', () => {
      it('returns only CONNECTED connections, across tenants', async () => {
        const store = make();
        const tenant_a = make_contract_tenant_id();
        const tenant_b = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_a, 'ok'));
        await store.save_connection(
          make_contract_connection(tenant_a, 'attention', {
            status: ConnectionStatus.NEEDS_ATTENTION,
          }),
        );
        await store.save_connection(
          make_contract_connection(tenant_a, 'gone', { status: ConnectionStatus.DISCONNECTED }),
        );
        await store.save_connection(make_contract_connection(tenant_b, 'ok'));

        const connections = await store.list_syncable_connections(ALL_ROWS_LIMIT);

        expect(labels_of_mine(connections, [tenant_a, tenant_b]).sort()).toEqual(
          [`${tenant_a}/ok`, `${tenant_b}/ok`].sort(),
        );
        expect(connections.every((c) => c.status === ConnectionStatus.CONNECTED)).toBe(true);
      });

      it('returns the complete connection', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const connection = make_contract_connection(tenant_id, 'c1', {
          account_label: 'Label',
          external_account_id: 'ext',
          secret_ref: 'ref',
          scopes: ['read', 'write'],
          last_sync_at: 1786234975000,
          last_error: 'old',
        });
        await store.save_connection(connection);

        const connections = await store.list_syncable_connections(ALL_ROWS_LIMIT);

        expect(connections.find((c) => c.tenant_id === tenant_id)).toEqual(connection);
      });

      it('orders never-synced first, then oldest sync first, ties by tenant then connection', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [
          make_contract_tenant_id(),
          make_contract_tenant_id(),
        ].sort() as [string, string];
        await store.save_connection(
          make_contract_connection(tenant_b, 'new', { last_sync_at: 5000 }),
        );
        await store.save_connection(
          make_contract_connection(tenant_a, 'old', { last_sync_at: 1786234975000 - 1 }),
        );
        await store.save_connection(make_contract_connection(tenant_b, 'never'));
        await store.save_connection(make_contract_connection(tenant_a, 'never'));
        await store.save_connection(
          make_contract_connection(tenant_a, 'tie_b', { last_sync_at: 3000 }),
        );
        await store.save_connection(
          make_contract_connection(tenant_b, 'tie_a', { last_sync_at: 3000 }),
        );
        await store.save_connection(
          make_contract_connection(tenant_a, 'tie_a', { last_sync_at: 3000 }),
        );
        await store.save_connection(make_contract_connection(tenant_a, 'never_2'));
        await store.save_connection(
          make_contract_connection(tenant_a, 'zero', { last_sync_at: 0 }),
        );

        const connections = await store.list_syncable_connections(ALL_ROWS_LIMIT);

        expect(labels_of_mine(connections, [tenant_a, tenant_b])).toEqual([
          `${tenant_a}/never`,
          `${tenant_a}/never_2`,
          `${tenant_b}/never`,
          `${tenant_a}/zero`,
          `${tenant_a}/tie_a`,
          `${tenant_a}/tie_b`,
          `${tenant_b}/tie_a`,
          `${tenant_b}/new`,
          `${tenant_a}/old`,
        ]);
        expect(is_in_sync_order(connections)).toBe(true);
      });

      it('compares last sync times in epoch milliseconds', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'later', { last_sync_at: 1786234975001 }),
        );
        await store.save_connection(
          make_contract_connection(tenant_id, 'earlier', { last_sync_at: 1786234975000 }),
        );

        const connections = await store.list_syncable_connections(ALL_ROWS_LIMIT);

        expect(labels_of_mine(connections, [tenant_id])).toEqual([
          `${tenant_id}/earlier`,
          `${tenant_id}/later`,
        ]);
      });

      it('applies the limit after ordering', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c_late', { last_sync_at: 9000 }),
        );
        await store.save_connection(make_contract_connection(tenant_id, 'c_never'));
        await store.save_connection(
          make_contract_connection(tenant_id, 'c_early', { last_sync_at: 1000 }),
        );

        const one = await store.list_syncable_connections(1);
        const two = await store.list_syncable_connections(2);

        expect(one).toHaveLength(1);
        expect(one[0]?.last_sync_at).toBeNull();
        expect(two).toHaveLength(2);
        expect(two.every((c) => c.status === ConnectionStatus.CONNECTED)).toBe(true);
        expect(is_in_sync_order(two)).toBe(true);
      });

      it("keeps the relative order of a test's own rows under a limit", async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c_late', { last_sync_at: 9000 }),
        );
        await store.save_connection(
          make_contract_connection(tenant_id, 'c_early', { last_sync_at: 1000 }),
        );

        const limited = await store.list_syncable_connections(ALL_ROWS_LIMIT);
        const mine = labels_of_mine(limited, [tenant_id]);

        expect(mine).toEqual([`${tenant_id}/c_early`, `${tenant_id}/c_late`]);
      });

      it.each([[0], [-1], [Number.NaN]])('returns no rows for limit %s', async (limit) => {
        const store = make();
        await store.save_connection(make_contract_connection(make_contract_tenant_id(), 'c1'));

        expect(await store.list_syncable_connections(limit)).toEqual([]);
      });

      it('stops listing a connection once it is no longer CONNECTED', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'c1'));
        await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: null, last_error: 'auth', status: ConnectionStatus.NEEDS_ATTENTION },
          'actor',
          2000,
        );

        const connections = await store.list_syncable_connections(ALL_ROWS_LIMIT);

        expect(labels_of_mine(connections, [tenant_id])).toEqual([]);
      });

      it('returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', { scopes: ['read'] }),
        );

        const first = (await store.list_syncable_connections(ALL_ROWS_LIMIT)).find(
          (c) => c.tenant_id === tenant_id,
        );
        first!.scopes.push('mutated');

        expect((await store.get_connection(tenant_id, 'c1'))?.scopes).toEqual(['read']);
      });
    });

    describe('record_sync_outcome', () => {
      it('sets last_sync_at and clears the error on success, and stamps the update', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', {
            last_sync_at: 1000,
            last_error: 'earlier failure',
          }),
        );

        const updated = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: 1786234975000, last_error: null, status: null },
          'scheduler',
          1786234976000,
        );

        expect(updated).toMatchObject({
          last_sync_at: 1786234975000,
          last_error: null,
          status: ConnectionStatus.CONNECTED,
          updated_at: 1786234976000,
          updated_by: 'scheduler',
          created_at: 1000,
          created_by: 'creator',
        });
        expect(await store.get_connection(tenant_id, 'c1')).toEqual(updated);
      });

      it('keeps last_sync_at and records the error on failure', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', { last_sync_at: 4000 }),
        );

        const updated = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: null, last_error: 'Rate limited "now"', status: null },
          'scheduler',
          5000,
        );

        expect(updated).toMatchObject({
          last_sync_at: 4000,
          last_error: 'Rate limited "now"',
          status: ConnectionStatus.CONNECTED,
        });
        expect((await store.get_connection(tenant_id, 'c1'))?.last_error).toBe(
          'Rate limited "now"',
        );
      });

      it('changes the status when one is given and leaves it when null', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(make_contract_connection(tenant_id, 'c1'));

        const flagged = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: null, last_error: 'auth', status: ConnectionStatus.NEEDS_ATTENTION },
          'scheduler',
          2000,
        );
        const unchanged = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: null, last_error: 'still failing', status: null },
          'scheduler',
          3000,
        );

        expect(flagged?.status).toBe(ConnectionStatus.NEEDS_ATTENTION);
        expect(unchanged?.status).toBe(ConnectionStatus.NEEDS_ATTENTION);
        expect((await store.get_connection(tenant_id, 'c1'))?.status).toBe(
          ConnectionStatus.NEEDS_ATTENTION,
        );
      });

      it('can restore CONNECTED, clear the error and set the sync time together', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', {
            status: ConnectionStatus.NEEDS_ATTENTION,
            last_error: 'auth',
          }),
        );

        const updated = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: 7000, last_error: null, status: ConnectionStatus.CONNECTED },
          'scheduler',
          7001,
        );

        expect(updated).toMatchObject({
          status: ConnectionStatus.CONNECTED,
          last_sync_at: 7000,
          last_error: null,
        });
      });

      it('leaves every other field untouched', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const original = make_contract_connection(tenant_id, 'c1', {
          account_label: 'Label',
          external_account_id: 'ext',
          secret_ref: 'ref',
          scopes: ['read', 'write'],
        });
        await store.save_connection(original);

        const updated = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: 100, last_error: 'x', status: ConnectionStatus.NEEDS_ATTENTION },
          'actor',
          200,
        );

        expect(updated).toEqual({
          ...original,
          last_sync_at: 100,
          last_error: 'x',
          status: ConnectionStatus.NEEDS_ATTENTION,
          updated_at: 200,
          updated_by: 'actor',
        });
      });

      it('returns null and creates nothing when the connection does not exist', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();

        const result = await store.record_sync_outcome(
          tenant_id,
          'missing',
          { last_sync_at: 1, last_error: null, status: null },
          'actor',
          2,
        );

        expect(result).toBeNull();
        expect(await store.get_connection(tenant_id, 'missing')).toBeNull();
      });

      it('returns a copy', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_connection(
          make_contract_connection(tenant_id, 'c1', { scopes: ['read'] }),
        );

        const updated = await store.record_sync_outcome(
          tenant_id,
          'c1',
          { last_sync_at: 1, last_error: null, status: null },
          'actor',
          2,
        );
        updated!.scopes.push('mutated');

        expect((await store.get_connection(tenant_id, 'c1'))?.scopes).toEqual(['read']);
      });
    });
  });
}
