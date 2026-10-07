import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ICredentialVault } from '../ports/credential_vault.interface.js';

/**
 * Registers the behaviour every {@link ICredentialVault} must have.
 * @param label Name of the implementation under test.
 * @param make Factory returning a fresh vault.
 * @returns Nothing; registers a Vitest `describe`.
 */
export function describe_credential_vault_contract(
  label: string,
  make: () => ICredentialVault,
): void {
  describe(`${label} credential vault contract`, () => {
    it('returns null when nothing is stored', async () => {
      expect(await make().read(randomUUID(), randomUUID())).toBeNull();
    });

    it('stores and reads back credentials', async () => {
      const vault = make();
      const [tenant, connection] = [randomUUID(), randomUUID()];

      await vault.write(tenant, connection, { client_id: 'id', client_secret: 'secret' });

      expect(await vault.read(tenant, connection)).toEqual({
        client_id: 'id',
        client_secret: 'secret',
      });
    });

    it('replaces earlier credentials', async () => {
      const vault = make();
      const [tenant, connection] = [randomUUID(), randomUUID()];
      await vault.write(tenant, connection, { client_id: 'old', client_secret: 'old-secret' });

      await vault.write(tenant, connection, { client_id: 'new', client_secret: 'new-secret' });

      expect(await vault.read(tenant, connection)).toEqual({
        client_id: 'new',
        client_secret: 'new-secret',
      });
    });

    it('keeps tenants and connections apart', async () => {
      const vault = make();
      const [tenant_a, tenant_b, connection] = [randomUUID(), randomUUID(), randomUUID()];
      await vault.write(tenant_a, connection, { client_id: 'a', client_secret: 'sa' });

      expect(await vault.read(tenant_b, connection)).toBeNull();
      expect(await vault.read(tenant_a, randomUUID())).toBeNull();
    });

    it('deletes credentials, and deleting nothing is not an error', async () => {
      const vault = make();
      const [tenant, connection] = [randomUUID(), randomUUID()];
      await vault.write(tenant, connection, { client_id: 'id', client_secret: 's' });

      await vault.delete(tenant, connection);
      await vault.delete(tenant, connection);

      expect(await vault.read(tenant, connection)).toBeNull();
    });

    it('does not let a caller change stored values through a returned object', async () => {
      const vault = make();
      const [tenant, connection] = [randomUUID(), randomUUID()];
      await vault.write(tenant, connection, { client_id: 'id', client_secret: 's' });

      const first = await vault.read(tenant, connection);
      if (first) first.client_secret = 'tampered';

      expect((await vault.read(tenant, connection))?.client_secret).toBe('s');
    });
  });
}
