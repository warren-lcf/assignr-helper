import {
  create_secret_manager_client,
  type RawSecretBackend,
} from '@hch-shared-libraries/core-server';
import { describe, expect, it } from 'vitest';
import { describe_credential_vault_contract } from './contracts/credential_vault.contract.js';
import { SecretManagerCredentialVault } from './secret_manager_credential_vault.js';

function make_backend(): RawSecretBackend & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    read_latest: async (name) => store.get(name) ?? null,
    write_version: async (name, value) => {
      store.set(name, value);
    },
    destroy: async (name) => {
      store.delete(name);
    },
  };
}

function make_vault(backend = make_backend()) {
  const secrets = create_secret_manager_client({ project_id: 'p', backend });
  return { vault: new SecretManagerCredentialVault(secrets), backend };
}

describe_credential_vault_contract('Secret Manager', () => make_vault().vault);

describe('SecretManagerCredentialVault', () => {
  it('names each secret by tenant and connection, in core-server convention', async () => {
    const { vault, backend } = make_vault();

    await vault.write('tenant-1', 'conn_9', { client_id: 'id', client_secret: 's' });

    expect([...backend.store.keys()]).toEqual(['tenant-tenant-1-connection-conn-9']);
    expect(JSON.parse([...backend.store.values()][0])).toEqual({
      client_id: 'id',
      client_secret: 's',
    });
  });

  it.each([
    '{not json',
    '"just a string"',
    '{"client_id":"only-id"}',
    '{"client_id":1,"client_secret":"s"}',
  ])('refuses unreadable stored credentials %s without echoing them', async (raw) => {
    const { vault, backend } = make_vault();
    backend.store.set('tenant-t1-connection-c1', raw);

    const error = await vault.read('t1', 'c1').catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('connection c1');
    expect((error as Error).message).not.toContain('only-id');
  });
});
