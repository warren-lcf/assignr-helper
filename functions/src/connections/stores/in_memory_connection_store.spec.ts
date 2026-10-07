import { describe, expect, it } from 'vitest';
import { ConnectionStatus } from '../enums/connection_status.enum.js';
import { describe_connection_store_contract } from './contracts/connection_store.contract.js';
import { make_contract_connection } from './contracts/make_contract_connection.js';
import { InMemoryConnectionStore } from './in_memory_connection_store.js';

describe_connection_store_contract('InMemory', () => new InMemoryConnectionStore());

describe('InMemoryConnectionStore', () => {
  it('returns exactly the saved connections when listing syncable rows', async () => {
    const store = new InMemoryConnectionStore();
    await store.save_connection(make_contract_connection('t1', 'b', { last_sync_at: 20 }));
    await store.save_connection(make_contract_connection('t1', 'a', { last_sync_at: 10 }));
    await store.save_connection(make_contract_connection('t0', 'z'));
    await store.save_connection(
      make_contract_connection('t1', 'c', { status: ConnectionStatus.DISCONNECTED }),
    );

    const connections = await store.list_syncable_connections(10);
    const limited = await store.list_syncable_connections(2);

    expect(connections.map((c) => `${c.tenant_id}/${c.connection_id}`)).toEqual([
      't0/z',
      't1/a',
      't1/b',
    ]);
    expect(limited).toHaveLength(2);
  });

  it('floors a fractional limit and treats a limit below one as empty', async () => {
    const store = new InMemoryConnectionStore();
    await store.save_connection(make_contract_connection('t1', 'a'));
    await store.save_connection(make_contract_connection('t1', 'b'));

    expect(await store.list_syncable_connections(1.9)).toHaveLength(1);
    expect(await store.list_syncable_connections(0.5)).toEqual([]);
  });
});
