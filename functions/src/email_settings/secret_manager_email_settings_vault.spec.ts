import {
  create_secret_manager_client,
  type RawSecretBackend,
} from '@hch-shared-libraries/core-server';
import { describe, expect, it } from 'vitest';
import { describe_email_settings_vault_contract } from './contracts/email_settings_vault.contract.js';
import { SecretManagerEmailSettingsVault } from './secret_manager_email_settings_vault.js';

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
  return { vault: new SecretManagerEmailSettingsVault(secrets), backend };
}

describe_email_settings_vault_contract('Secret Manager', () => make_vault().vault);

describe('SecretManagerEmailSettingsVault', () => {
  it('names each secret by tenant with the sendgrid suffix, in core-server convention', async () => {
    const { vault, backend } = make_vault();

    await vault.write('tenant-1', {
      api_key: 'SG.k',
      from_email: 'a@example.com',
      from_name: null,
      reply_to: null,
      postal_address: null,
    });

    expect([...backend.store.keys()]).toEqual(['tenant-tenant-1-sendgrid']);
    expect(JSON.parse([...backend.store.values()][0])).toEqual({
      api_key: 'SG.k',
      from_email: 'a@example.com',
      from_name: null,
      reply_to: null,
      postal_address: null,
    });
  });

  it.each([
    '{not json',
    '"just a string"',
    'null',
    '{"api_key":"SG.leaky-key"}',
    '{"from_email":"a@example.com"}',
    '{"api_key":1,"from_email":"a@example.com"}',
    '{"api_key":"SG.leaky-key","from_email":"a@example.com","from_name":5}',
  ])('refuses unreadable stored settings %s without echoing them', async (raw) => {
    const { vault, backend } = make_vault();
    backend.store.set('tenant-t1-sendgrid', raw);

    const error = await vault.read('t1').catch((caught: Error) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('tenant t1');
    expect((error as Error).message).not.toContain('leaky-key');
    expect((error as Error).message).not.toContain('example.com');
  });
});
