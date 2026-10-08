import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it, vi } from 'vitest';
import { IActingUser } from '../http/models/acting_user.model.js';
import { ContactService } from './contact.service.js';
import { CONTACT_LIMITS } from './contact_limits.constant.js';
import { ConsentStatus } from './enums/consent_status.enum.js';
import { CreateContactOutcome } from './enums/create_contact_outcome.enum.js';
import { ContactExistsError } from './errors/contact_exists.error.js';
import { ContactLimitReachedError } from './errors/contact_limit_reached.error.js';
import { ContactNotFoundError } from './errors/contact_not_found.error.js';
import { InMemoryContactStore } from './stores/in_memory_contact_store.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'TENANT_OWNER',
  effective_role: 'TENANT_OWNER',
};

/**
 * Builds the service over in-memory parts and a clock that advances one second per reading.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const contacts = new InMemoryContactStore();
  const audit = create_in_memory_audit_log_store();
  let counter = 0;
  let clock = 1000;
  const service = new ContactService({
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: () => (clock += 1000),
    generate_id: () => `c${++counter}`,
  });
  return { service, contacts, audit };
}

describe('ContactService.create_contact', () => {
  it('stores a granted contact stamped with the actor', async () => {
    const { service, contacts } = make_service();

    const created = await service.create_contact(ACTOR, {
      display_name: 'Sam',
      email_address: 'sam@example.com',
    });

    expect(created).toMatchObject({
      tenant_id: 't1',
      contact_id: 'c1',
      consent_status: ConsentStatus.GRANTED,
      unsubscribed_at: null,
      created_by: 'u-owner',
      updated_by: 'u-owner',
    });
    expect(created.consent_updated_at).toBe(created.created_at);
    expect(await contacts.get_contact('t1', 'c1')).toEqual(created);
  });

  it('turns a duplicate into ContactExistsError and writes no audit row', async () => {
    const { service, audit } = make_service();
    await service.create_contact(ACTOR, { display_name: 'Sam', email_address: 'sam@example.com' });

    await expect(
      service.create_contact(ACTOR, { display_name: 'Again', email_address: 'sam@example.com' }),
    ).rejects.toBeInstanceOf(ContactExistsError);
    expect(audit.rows).toHaveLength(1);
  });

  it.each([CreateContactOutcome.EMAIL_EXISTS, CreateContactOutcome.SUPPRESSED])(
    'treats the store outcome %s as an existing contact',
    async (outcome) => {
      const { service, contacts } = make_service();
      vi.spyOn(contacts, 'create_contact').mockResolvedValue(outcome);

      await expect(
        service.create_contact(ACTOR, { display_name: 'Sam', email_address: 'sam@example.com' }),
      ).rejects.toBeInstanceOf(ContactExistsError);
    },
  );

  it('refuses at the contact limit before touching the store', async () => {
    const { service, contacts } = make_service();
    vi.spyOn(contacts, 'count_contacts').mockResolvedValue(CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT);
    const create = vi.spyOn(contacts, 'create_contact');

    await expect(
      service.create_contact(ACTOR, { display_name: 'Sam', email_address: 'sam@example.com' }),
    ).rejects.toBeInstanceOf(ContactLimitReachedError);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('ContactService.import_contacts', () => {
  it('reports each problem row by its 1-based position without echoing the address', async () => {
    const { service } = make_service();

    const result = await service.import_contacts(ACTOR, [
      { email_address: 'bad' },
      { email_address: 'ok@example.com' },
      { display_name: 'a\nb', email_address: 'x@example.com' },
    ]);

    expect(result).toEqual({
      added: 1,
      skipped_existing: 0,
      invalid: [
        { row: 1, reason: 'The email address is not valid' },
        { row: 3, reason: 'The name must not contain control characters or line breaks' },
      ],
    });
  });

  it('counts a repeat within the import once as added and then as skipped', async () => {
    const { service } = make_service();

    const result = await service.import_contacts(ACTOR, [
      { email_address: 'a@example.com' },
      { email_address: 'A@example.com' },
    ]);

    expect(result).toMatchObject({ added: 1, skipped_existing: 1 });
  });
});

describe('ContactService.delete_contact and list_contacts', () => {
  it('throws ContactNotFoundError for an unknown contact', async () => {
    const { service } = make_service();

    await expect(service.delete_contact(ACTOR, 'nope')).rejects.toBeInstanceOf(
      ContactNotFoundError,
    );
  });

  it('lists the tenant contacts only', async () => {
    const { service } = make_service();
    await service.create_contact(ACTOR, { display_name: 'B', email_address: 'b@example.com' });
    await service.create_contact(
      { ...ACTOR, tenant_id: 't2' },
      { display_name: 'A', email_address: 'a@example.com' },
    );

    expect((await service.list_contacts('t1')).map((c) => c.display_name)).toEqual(['B']);
  });
});
