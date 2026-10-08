import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IStoredEmailSettings } from '../models/stored_email_settings.model.js';
import { IEmailSettingsVault } from '../ports/email_settings_vault.interface.js';

const FULL: IStoredEmailSettings = {
  api_key: 'SG.secret-key',
  from_email: 'refs@example.com',
  from_name: 'Metro Referee Desk',
  reply_to: 'desk@example.com',
  postal_address: '1 Main St\nSpringfield, VA 22150',
};

/**
 * Registers the behaviour every {@link IEmailSettingsVault} must have.
 * @param label Name of the implementation under test.
 * @param make Factory returning a fresh vault.
 * @returns Nothing; registers a Vitest `describe`.
 */
export function describe_email_settings_vault_contract(
  label: string,
  make: () => IEmailSettingsVault,
): void {
  describe(`${label} email settings vault contract`, () => {
    it('returns null when nothing is stored', async () => {
      expect(await make().read(randomUUID())).toBeNull();
    });

    it('stores and reads back every field', async () => {
      const vault = make();
      const tenant = randomUUID();

      await vault.write(tenant, FULL);

      expect(await vault.read(tenant)).toEqual(FULL);
    });

    it('round-trips null optional fields', async () => {
      const vault = make();
      const tenant = randomUUID();
      const minimal = { ...FULL, from_name: null, reply_to: null, postal_address: null };

      await vault.write(tenant, minimal);

      expect(await vault.read(tenant)).toEqual(minimal);
    });

    it('replaces earlier settings', async () => {
      const vault = make();
      const tenant = randomUUID();
      await vault.write(tenant, FULL);

      await vault.write(tenant, { ...FULL, api_key: 'SG.new', from_name: null });

      expect(await vault.read(tenant)).toEqual({ ...FULL, api_key: 'SG.new', from_name: null });
    });

    it('keeps tenants apart', async () => {
      const vault = make();
      const [tenant_a, tenant_b] = [randomUUID(), randomUUID()];
      await vault.write(tenant_a, FULL);

      expect(await vault.read(tenant_b)).toBeNull();
    });

    it('deletes settings, and deleting nothing is not an error', async () => {
      const vault = make();
      const tenant = randomUUID();
      await vault.write(tenant, FULL);

      await vault.delete(tenant);
      await vault.delete(tenant);

      expect(await vault.read(tenant)).toBeNull();
    });

    it('does not let a caller change stored values through a returned object', async () => {
      const vault = make();
      const tenant = randomUUID();
      await vault.write(tenant, FULL);

      const first = await vault.read(tenant);
      if (first) first.api_key = 'tampered';

      expect((await vault.read(tenant))?.api_key).toBe('SG.secret-key');
    });
  });
}
