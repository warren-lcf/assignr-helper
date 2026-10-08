import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it } from 'vitest';
import { IActingUser } from '../http/models/acting_user.model.js';
import { EmailSettingsService } from './email_settings.service.js';
import { EmailApiKeyRequiredError } from './errors/email_api_key_required.error.js';
import { InMemoryEmailSettingsVault } from './in_memory_email_settings_vault.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'TENANT_OWNER',
  effective_role: 'TENANT_OWNER',
};

const INPUT = {
  api_key: 'SG.key-one',
  from_email: 'desk@example.com',
  from_name: 'Desk',
  reply_to: null,
  postal_address: null,
};

/**
 * Builds the service over in-memory parts.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const vault = new InMemoryEmailSettingsVault();
  const audit = create_in_memory_audit_log_store();
  const service = new EmailSettingsService({
    vault,
    audit: create_audit_log_service({ store: audit }),
  });
  return { service, vault, audit };
}

describe('EmailSettingsService', () => {
  it('needs an API key until email is configured', async () => {
    const { service, vault } = make_service();

    await expect(service.save(ACTOR, { ...INPUT, api_key: null })).rejects.toBeInstanceOf(
      EmailApiKeyRequiredError,
    );
    expect(await vault.read('t1')).toBeNull();
  });

  it('keeps the stored key when none is given and the full settings are available for sending', async () => {
    const { service } = make_service();
    await service.save(ACTOR, INPUT);

    const view = await service.save(ACTOR, { ...INPUT, api_key: null, from_name: null });

    expect(view).toMatchObject({ configured: true, from_name: null });
    expect((await service.get_for_sending('t1'))?.api_key).toBe('SG.key-one');
  });

  it('exposes the key to the sending path only through get_for_sending, never through the view', async () => {
    const { service } = make_service();
    await service.save(ACTOR, INPUT);

    expect(JSON.stringify(await service.get_view('t1'))).not.toContain('key-one');
    expect((await service.get_for_sending('t1'))?.api_key).toBe('SG.key-one');
    expect(await service.get_for_sending('t2')).toBeNull();
  });

  it('flags a key change in the audit only when the key really changed', async () => {
    const { service, audit } = make_service();
    await service.save(ACTOR, INPUT);
    await service.save(ACTOR, INPUT);
    await service.save(ACTOR, { ...INPUT, api_key: 'SG.key-two' });

    const flags = audit.rows.map(
      (row) => JSON.parse(row.after_state_json ?? 'null').provider_key_changed,
    );
    expect(flags).toEqual([true, false, true]);
  });

  it('removes the settings, auditing only a real removal', async () => {
    const { service, audit } = make_service();
    await service.save(ACTOR, INPUT);

    await service.remove(ACTOR);
    await service.remove(ACTOR);

    expect(await service.get_for_sending('t1')).toBeNull();
    expect(audit.rows.map((row) => row.action)).toEqual(['CREATE', 'DELETE']);
  });
});
