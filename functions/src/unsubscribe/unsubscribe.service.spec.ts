import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryContactStore } from '../contacts/stores/in_memory_contact_store.js';
import { make_contract_contact } from '../contacts/stores/contracts/make_contract_contact.js';
import { parse_unsubscribe_token } from '../domain/unsubscribe/parse_unsubscribe_token.js';
import { UnsubscribeKeyUnavailableError } from './errors/unsubscribe_key_unavailable.error.js';
import { InMemorySecretKeyBackend } from './in_memory_secret_key_backend.js';
import { SecretManagerUnsubscribeKeys } from './secret_manager_unsubscribe_keys.js';
import { UNSUBSCRIBE_ACTOR, UnsubscribeService } from './unsubscribe.service.js';

/**
 * Builds the service over in-memory parts.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const contacts = new InMemoryContactStore();
  const secrets = new InMemorySecretKeyBackend();
  const audit = create_in_memory_audit_log_store();
  const service = new UnsubscribeService({
    keys: new SecretManagerUnsubscribeKeys({ backend: secrets }),
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: () => 7000,
  });
  return { service, contacts, secrets, audit };
}

describe('UnsubscribeService', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('issues a token that names the tenant, the contact and key version 1', async () => {
    const { service } = make_service();

    const token = await service.issue_token('t1', 'c1');

    expect(parse_unsubscribe_token(token)).toMatchObject({
      key_version: 1,
      subject: { tenant_id: 't1', contact_id: 'c1' },
    });
  });

  it('issues the same token for the same contact and different tokens for different contacts', async () => {
    const { service } = make_service();

    expect(await service.issue_token('t1', 'c1')).toBe(await service.issue_token('t1', 'c1'));
    expect(await service.issue_token('t1', 'c1')).not.toBe(await service.issue_token('t1', 'c2'));
    expect(await service.issue_token('t1', 'c1')).not.toBe(await service.issue_token('t2', 'c1'));
  });

  it('creates the signing key on first use, once', async () => {
    const { service, secrets } = make_service();

    await service.prepare();
    await service.issue_token('t1', 'c1');

    expect([...secrets.secrets.keys()]).toEqual(['assignr-helper-unsubscribe-key-v1']);
  });

  it('refuses to issue anything when the signing key is unavailable', async () => {
    const { service, secrets } = make_service();
    vi.spyOn(secrets, 'read').mockRejectedValue(new Error('denied'));

    await expect(service.prepare()).rejects.toBeInstanceOf(UnsubscribeKeyUnavailableError);
    await expect(service.issue_token('t1', 'c1')).rejects.toBeInstanceOf(
      UnsubscribeKeyUnavailableError,
    );
  });

  it('describes and unsubscribes through the token, stamping the system actor', async () => {
    const { service, contacts, audit } = make_service();
    await contacts.create_contact(make_contract_contact('t1', 'c1'));
    const token = await service.issue_token('t1', 'c1');

    expect(await service.describe(token)).toEqual({
      email_masked: 'c***@t***.com',
      already_unsubscribed: false,
    });
    expect(await service.unsubscribe(token)).toBe(true);

    expect(await contacts.get_contact('t1', 'c1')).toMatchObject({
      consent_status: 'UNSUBSCRIBED',
      unsubscribed_at: 7000,
      updated_by: UNSUBSCRIBE_ACTOR,
    });
    expect(await service.describe(token)).toMatchObject({ already_unsubscribed: true });
    expect(audit.rows).toHaveLength(1);
  });

  it('answers null or false for a token that is not valid', async () => {
    const { service } = make_service();

    expect(await service.describe('garbage')).toBeNull();
    expect(await service.unsubscribe('garbage')).toBe(false);
  });

  it('answers null or false for a valid token whose contact is gone', async () => {
    const { service } = make_service();
    const token = await service.issue_token('t1', 'ghost');

    expect(await service.describe(token)).toBeNull();
    expect(await service.unsubscribe(token)).toBe(false);
  });
});
