import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationProvider } from '../integrations/enums/integration_provider.enum.js';
import { make_connection } from '../sync/make_connection.fixture.js';
import { ConnectionAdminService } from './connection_admin.service.js';
import { ConnectionStatus } from './enums/connection_status.enum.js';
import { ConnectionTestFailure } from './enums/connection_test_failure.enum.js';
import { ConnectionAccountMismatchError } from './errors/connection_account_mismatch.error.js';
import { ConnectionCredentialsIncompleteError } from './errors/connection_credentials_incomplete.error.js';
import { ConnectionCredentialsRejectedError } from './errors/connection_credentials_rejected.error.js';
import { ConnectionNotFoundError } from './errors/connection_not_found.error.js';
import { InMemoryCredentialVault } from './in_memory_credential_vault.js';
import { IAdminActor } from './models/admin_actor.model.js';
import { IVerifiedAccount } from './models/verified_account.model.js';
import { InMemoryConnectionStore } from './stores/in_memory_connection_store.js';

const ACTOR: IAdminActor = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'TENANT_OWNER',
  effective_role: 'TENANT_OWNER',
};
const ACCOUNT: IVerifiedAccount = { external_account_id: 'acct-1', label: 'Metro Youth Soccer' };
const INPUT = {
  provider: IntegrationProvider.ASSIGNR,
  client_id: 'id',
  client_secret: 'the-secret',
};

function make_service() {
  const connections = new InMemoryConnectionStore();
  const vault = new InMemoryCredentialVault();
  const verify = vi.fn(async (): Promise<IVerifiedAccount> => ACCOUNT);
  const invalidate = vi.fn();
  const audit_store = create_in_memory_audit_log_store();
  let counter = 0;
  let clock = 1000;
  const service = new ConnectionAdminService({
    connections,
    vault,
    verifier: { verify },
    token_invalidator: { invalidate },
    audit: create_audit_log_service({ store: audit_store, now: () => 5000 }),
    now: () => (clock += 1),
    generate_id: () => `conn-${++counter}`,
  });
  return { service, connections, vault, verify, invalidate, audit_store };
}

describe('ConnectionAdminService.create_connection', () => {
  it('verifies, stores the credentials in the vault only, saves the connection, and audits it', async () => {
    const { service, connections, vault, verify, invalidate, audit_store } = make_service();

    const connection = await service.create_connection(ACTOR, INPUT);

    expect(verify).toHaveBeenCalledWith(IntegrationProvider.ASSIGNR, {
      client_id: 'id',
      client_secret: 'the-secret',
    });
    expect(connection).toMatchObject({
      tenant_id: 't1',
      connection_id: 'conn-1',
      status: ConnectionStatus.CONNECTED,
      account_label: 'Metro Youth Soccer',
      external_account_id: 'acct-1',
      last_error: null,
      created_by: 'u-owner',
      updated_by: 'u-owner',
    });
    expect(await vault.read('t1', 'conn-1')).toEqual({
      client_id: 'id',
      client_secret: 'the-secret',
    });
    expect(await connections.get_connection('t1', 'conn-1')).toEqual(connection);
    expect(JSON.stringify(connection)).not.toContain('the-secret');
    expect(invalidate).toHaveBeenCalledWith('t1', 'conn-1');
    expect(audit_store.rows).toHaveLength(1);
    expect(audit_store.rows[0]).toMatchObject({
      user_id: 'u-owner',
      tenant_id: 't1',
      resource_type: 'integration_connection',
      resource_id: 'conn-1',
      action: 'CREATE',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
  });

  it('never writes a secret to the audit trail or the connection row', async () => {
    const { service, audit_store, connections } = make_service();

    await service.create_connection(ACTOR, INPUT);

    const everything = JSON.stringify([audit_store.rows, await connections.list_connections('t1')]);
    expect(everything).not.toContain('the-secret');
    expect(everything).not.toContain('"id"');
  });

  it('stores nothing when the provider rejects the credentials', async () => {
    const { service, connections, vault, verify, audit_store } = make_service();
    verify.mockRejectedValueOnce(new ConnectionCredentialsRejectedError());

    await expect(service.create_connection(ACTOR, INPUT)).rejects.toBeInstanceOf(
      ConnectionCredentialsRejectedError,
    );

    expect(await connections.list_connections('t1')).toEqual([]);
    expect(await vault.read('t1', 'conn-1')).toBeNull();
    expect(audit_store.rows).toEqual([]);
  });

  it('reuses the connection when the tenant already has that account (reconnect), and audits an update', async () => {
    const { service, connections, vault, audit_store } = make_service();
    await connections.save_connection(
      make_connection({
        connection_id: 'existing',
        status: ConnectionStatus.NEEDS_ATTENTION,
        last_error: 'token rejected',
        last_sync_at: 4242,
        created_by: 'first-owner',
        created_at: 10,
      }),
    );

    const connection = await service.create_connection(ACTOR, INPUT);

    expect(connection).toMatchObject({
      connection_id: 'existing',
      status: ConnectionStatus.CONNECTED,
      last_error: null,
      last_sync_at: 4242,
      created_by: 'first-owner',
      created_at: 10,
      updated_by: 'u-owner',
    });
    expect(await connections.list_connections('t1')).toHaveLength(1);
    expect(await vault.read('t1', 'existing')).not.toBeNull();
    expect(audit_store.rows[0]).toMatchObject({ action: 'UPDATE', resource_id: 'existing' });
  });

  it('does not match another tenant account', async () => {
    const { service, connections } = make_service();
    await connections.save_connection(
      make_connection({ tenant_id: 'other', connection_id: 'theirs' }),
    );

    const connection = await service.create_connection(ACTOR, INPUT);

    expect(connection.connection_id).toBe('conn-1');
    expect(await connections.get_connection('other', 'theirs')).not.toBeNull();
  });

  it('removes a credential it just stored if saving the connection fails', async () => {
    const { service, connections, vault } = make_service();
    vi.spyOn(connections, 'save_connection').mockRejectedValueOnce(new Error('db down'));

    await expect(service.create_connection(ACTOR, INPUT)).rejects.toThrow('db down');

    expect(await vault.read('t1', 'conn-1')).toBeNull();
  });

  it('lets an unreachable provider through, storing nothing', async () => {
    const { service, vault, verify } = make_service();
    verify.mockRejectedValueOnce(new Error('network'));

    await expect(service.create_connection(ACTOR, INPUT)).rejects.toThrow('network');

    expect(await vault.read('t1', 'conn-1')).toBeNull();
  });
});

describe('ConnectionAdminService.replace_credentials', () => {
  async function seeded() {
    const context = make_service();
    await context.connections.save_connection(
      make_connection({
        status: ConnectionStatus.NEEDS_ATTENTION,
        last_error: 'token rejected',
        external_account_id: 'acct-1',
      }),
    );
    await context.vault.write('t1', 'c1', { client_id: 'old-id', client_secret: 'old-secret' });
    return context;
  }

  it('rotates the secret keeping the stored client id, reconnects, and audits', async () => {
    const { service, vault, verify, invalidate, audit_store, connections } = await seeded();

    const connection = await service.replace_credentials(ACTOR, 'c1', {
      client_secret: 'new-secret',
    });

    expect(verify).toHaveBeenCalledWith(IntegrationProvider.ASSIGNR, {
      client_id: 'old-id',
      client_secret: 'new-secret',
    });
    expect(await vault.read('t1', 'c1')).toEqual({
      client_id: 'old-id',
      client_secret: 'new-secret',
    });
    expect(connection).toMatchObject({ status: ConnectionStatus.CONNECTED, last_error: null });
    expect(await connections.get_connection('t1', 'c1')).toEqual(connection);
    expect(invalidate).toHaveBeenCalledWith('t1', 'c1');
    expect(audit_store.rows[0]).toMatchObject({ action: 'UPDATE', resource_id: 'c1' });
    expect(JSON.stringify(audit_store.rows)).not.toContain('new-secret');
  });

  it('changes the client id too when one is given', async () => {
    const { service, vault } = await seeded();

    await service.replace_credentials(ACTOR, 'c1', {
      client_id: 'new-id',
      client_secret: 'new-secret',
    });

    expect(await vault.read('t1', 'c1')).toEqual({
      client_id: 'new-id',
      client_secret: 'new-secret',
    });
  });

  it('needs a client id when none is stored to keep', async () => {
    const { service, vault } = await seeded();
    await vault.delete('t1', 'c1');

    await expect(
      service.replace_credentials(ACTOR, 'c1', { client_secret: 's' }),
    ).rejects.toBeInstanceOf(ConnectionCredentialsIncompleteError);
  });

  it('keeps the old credentials when the provider rejects the new ones', async () => {
    const { service, vault, verify, audit_store } = await seeded();
    verify.mockRejectedValueOnce(new ConnectionCredentialsRejectedError());

    await expect(
      service.replace_credentials(ACTOR, 'c1', { client_secret: 'bad' }),
    ).rejects.toBeInstanceOf(ConnectionCredentialsRejectedError);

    expect(await vault.read('t1', 'c1')).toEqual({
      client_id: 'old-id',
      client_secret: 'old-secret',
    });
    expect(audit_store.rows).toEqual([]);
  });

  it('refuses credentials that belong to a different account', async () => {
    const { service, vault, verify } = await seeded();
    verify.mockResolvedValueOnce({ external_account_id: 'someone-else', label: 'Other' });

    await expect(
      service.replace_credentials(ACTOR, 'c1', { client_secret: 's' }),
    ).rejects.toBeInstanceOf(ConnectionAccountMismatchError);

    expect(await vault.read('t1', 'c1')).toEqual({
      client_id: 'old-id',
      client_secret: 'old-secret',
    });
  });

  it('adopts the account id when the connection never had one', async () => {
    const { service, connections } = await seeded();
    await connections.save_connection(make_connection({ external_account_id: null }));

    const connection = await service.replace_credentials(ACTOR, 'c1', { client_secret: 's' });

    expect(connection.external_account_id).toBe('acct-1');
  });

  it('treats another tenant connection as missing', async () => {
    const { service } = await seeded();

    await expect(
      service.replace_credentials({ ...ACTOR, tenant_id: 'other' }, 'c1', { client_secret: 's' }),
    ).rejects.toBeInstanceOf(ConnectionNotFoundError);
  });
});

describe('ConnectionAdminService.test_connection', () => {
  it('says ok when the provider accepts the stored credentials, changing nothing', async () => {
    const { service, connections, vault } = make_service();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });
    const before = await connections.get_connection('t1', 'c1');

    expect(await service.test_connection('t1', 'c1')).toEqual({ ok: true, failure: null });
    expect(await connections.get_connection('t1', 'c1')).toEqual(before);
  });

  it('reports missing credentials', async () => {
    const { service, connections } = make_service();
    await connections.save_connection(make_connection());

    expect(await service.test_connection('t1', 'c1')).toEqual({
      ok: false,
      failure: ConnectionTestFailure.NO_CREDENTIALS,
    });
  });

  it('reports rejected credentials', async () => {
    const { service, connections, vault, verify } = make_service();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });
    verify.mockRejectedValueOnce(new ConnectionCredentialsRejectedError());

    expect(await service.test_connection('t1', 'c1')).toEqual({
      ok: false,
      failure: ConnectionTestFailure.REJECTED,
    });
  });

  it('reports an unreachable provider and logs the real error', async () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { service, connections, vault, verify } = make_service();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });
    verify.mockRejectedValueOnce(new Error('network'));

    expect(await service.test_connection('t1', 'c1')).toEqual({
      ok: false,
      failure: ConnectionTestFailure.UNREACHABLE,
    });
    expect(error_spy).toHaveBeenCalled();
    error_spy.mockRestore();
  });

  it('treats another tenant connection as missing', async () => {
    const { service, connections } = make_service();
    await connections.save_connection(make_connection());

    await expect(service.test_connection('other', 'c1')).rejects.toBeInstanceOf(
      ConnectionNotFoundError,
    );
  });
});

describe('ConnectionAdminService.disconnect', () => {
  it('deletes the stored credentials, marks the connection disconnected, and audits a delete', async () => {
    const { service, connections, vault, invalidate, audit_store } = make_service();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    const connection = await service.disconnect(ACTOR, 'c1');

    expect(connection.status).toBe(ConnectionStatus.DISCONNECTED);
    expect(await vault.read('t1', 'c1')).toBeNull();
    expect((await connections.get_connection('t1', 'c1'))?.status).toBe(
      ConnectionStatus.DISCONNECTED,
    );
    expect(invalidate).toHaveBeenCalledWith('t1', 'c1');
    expect(audit_store.rows[0]).toMatchObject({ action: 'DELETE', resource_id: 'c1' });
  });

  it('treats another tenant connection as missing and leaves its credentials alone', async () => {
    const { service, connections, vault } = make_service();
    await connections.save_connection(make_connection());
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 's' });

    await expect(service.disconnect({ ...ACTOR, tenant_id: 'other' }, 'c1')).rejects.toBeInstanceOf(
      ConnectionNotFoundError,
    );
    expect(await vault.read('t1', 'c1')).not.toBeNull();
  });
});
