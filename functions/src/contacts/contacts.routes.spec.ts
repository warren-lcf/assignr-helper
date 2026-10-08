import request from 'supertest';
import { http_call, type HttpMethod } from '../http/http_call.fixture.js';
import { describe, expect, it } from 'vitest';
import { ACTING_TENANT_HEADER, EFFECTIVE_ROLE_HEADER } from '../auth/create_auth_middleware.js';
import { IRoutesApp, ROUTE_TOKENS, make_routes_app } from '../sync/make_routes_app.fixture.js';
import { CONTACT_LIMITS } from './contact_limits.constant.js';
import { ConsentStatus } from './enums/consent_status.enum.js';
import { make_contract_contact } from './stores/contracts/make_contract_contact.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * Adds a contact as the tenant-A owner.
 * @param context The routes app under test.
 * @param body Request body; defaults to a valid contact.
 * @returns The supertest request.
 */
function add_contact(context: IRoutesApp, body: object = {}) {
  return request(context.app)
    .post('/api/contacts')
    .set(auth(ROUTE_TOKENS.owner_a))
    .send({
      display_name: 'Sam Smith',
      email_address: 'sam@example.com',
      consent_attested: true,
      ...body,
    });
}

describe('permission and tenant gating', () => {
  const routes: [HttpMethod, string, object | undefined][] = [
    ['get', '/api/contacts', undefined],
    ['post', '/api/contacts', {}],
    ['post', '/api/contacts/import', {}],
    ['delete', '/api/contacts/c1', undefined],
  ];

  it.each(routes)('%s %s requires sign-in', async (method, path, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, path);

    expect((await (body ? call.send(body) : call)).status).toBe(401);
  });

  it.each(routes)('%s %s is forbidden to a plain member', async (method, path, body) => {
    const context = make_routes_app();
    const call = http_call(context.app, method, path).set(auth(ROUTE_TOKENS.member_a));

    expect((await (body ? call.send(body) : call)).status).toBe(403);
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });

  it('is forbidden to an owner viewing as a plain member', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_a))
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_MEMBER')
      .send({ display_name: 'Sam', email_address: 'sam@example.com', consent_attested: true });

    expect(response.status).toBe(403);
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });

  it('asks a platform administrator with no tenant view to pick a tenant', async () => {
    const context = make_routes_app();

    const response = await request(context.app).get('/api/contacts').set(auth(ROUTE_TOKENS.admin));

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('TENANT_REQUIRED');
  });

  it('lets a platform administrator act for a tenant and records both roles', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/contacts')
      .set(auth(ROUTE_TOKENS.admin))
      .set(ACTING_TENANT_HEADER, 't1')
      .set(EFFECTIVE_ROLE_HEADER, 'TENANT_OWNER')
      .send({ display_name: 'Sam', email_address: 'sam@example.com', consent_attested: true });

    expect(response.status).toBe(201);
    expect(
      (await context.contacts.list_contacts('t1', { consent_status: null, limit: 10 }))[0],
    ).toMatchObject({
      created_by: 'u-admin',
    });
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-admin',
      tenant_id: 't1',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
  });
});

describe('POST /api/contacts', () => {
  it('adds a contact and answers with the contract view', async () => {
    const context = make_routes_app();

    const response = await add_contact(context);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      data: {
        contact: {
          contact_id: 'contact-1',
          display_name: 'Sam Smith',
          email_address: 'sam@example.com',
          consent_status: 'GRANTED',
          consent_updated_at: context.harness.clock(),
          unsubscribed_at: null,
          created_at: context.harness.clock(),
        },
      },
    });
  });

  it('stores the address trimmed and lower-cased', async () => {
    const context = make_routes_app();

    const response = await add_contact(context, { email_address: '  Sam.Smith@Example.COM ' });

    expect(response.body.data.contact.email_address).toBe('sam.smith@example.com');
  });

  it.each([
    ['missing', undefined],
    ['false', false],
    ['the text "true"', 'true'],
    ['1', 1],
    ['null', null],
  ])('refuses a contact when consent_attested is %s', async (_label, value) => {
    const context = make_routes_app();
    const body = {
      display_name: 'Sam',
      email_address: 'sam@example.com',
      ...(value === undefined ? {} : { consent_attested: value }),
    };

    const response = await request(context.app)
      .post('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.violations.map((v: { path: string }) => v.path)).toContain(
      'consent_attested',
    );
    expect(await context.contacts.count_contacts('t1')).toBe(0);
    expect(context.audit.rows).toHaveLength(0);
  });

  it.each([
    ['an unknown field', { tenant_id: 't2' }],
    ['a blank name', { display_name: '   ' }],
    ['a name over 100 characters', { display_name: 'x'.repeat(101) }],
    ['a line break in the name', { display_name: 'Sam\nBcc: evil@example.com' }],
    ['a carriage return in the name', { display_name: 'Sa\rm' }],
    ['an invalid address', { email_address: 'not-an-email' }],
    [
      'a header injection in the address',
      { email_address: 'sam@example.com\r\nBcc: evil@example.com' },
    ],
    ['two addresses', { email_address: 'a@example.com,b@example.com' }],
    ['a display-name address', { email_address: 'Sam <sam@example.com>' }],
    ['a missing address', { email_address: undefined }],
  ])('answers 400, never 500, for %s', async (_label, patch) => {
    const context = make_routes_app();

    const response = await add_contact(context, patch);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });

  it('refuses a duplicate address, ignoring case, and leaves the first contact alone', async () => {
    const context = make_routes_app();
    await add_contact(context);

    const response = await add_contact(context, {
      display_name: 'Impostor',
      email_address: 'SAM@example.com',
    });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONTACT_EXISTS');
    const contacts = await context.contacts.list_contacts('t1', {
      consent_status: null,
      limit: 10,
    });
    expect(contacts.map((c) => c.display_name)).toEqual(['Sam Smith']);
  });

  it('never re-subscribes an unsubscribed contact by adding the address again', async () => {
    const context = make_routes_app();
    await add_contact(context);
    await context.contacts.mark_unsubscribed('t1', 'contact-1', 5, 'public');

    const response = await add_contact(context);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONTACT_EXISTS');
    expect((await context.contacts.get_contact('t1', 'contact-1'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
  });

  it('never re-subscribes an unsubscribed contact by deleting and adding again', async () => {
    const context = make_routes_app();
    await add_contact(context);
    await context.contacts.mark_unsubscribed('t1', 'contact-1', 5, 'public');
    await request(context.app).delete('/api/contacts/contact-1').set(auth(ROUTE_TOKENS.owner_a));

    const response = await add_contact(context);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONTACT_EXISTS');
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });

  it('allows the same address in another tenant', async () => {
    const context = make_routes_app();
    await add_contact(context);

    const response = await request(context.app)
      .post('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_b))
      .send({ display_name: 'Sam', email_address: 'sam@example.com', consent_attested: true });

    expect(response.status).toBe(201);
  });

  it('stops at the contact limit', async () => {
    const context = make_routes_app();
    for (let i = 0; i < CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT; i++) {
      await context.contacts.create_contact(make_contract_contact('t1', `seed-${i}`));
    }

    const response = await add_contact(context);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CONTACT_LIMIT_REACHED');
  });

  it('audits the creation with a masked address and neither the address nor the name', async () => {
    const context = make_routes_app();

    await add_contact(context, {
      display_name: 'Samantha Secret',
      email_address: 'samantha.secret@example.com',
    });

    expect(context.audit.rows).toHaveLength(1);
    expect(context.audit.rows[0]).toMatchObject({
      user_id: 'u-owner-a',
      tenant_id: 't1',
      resource_type: 'contact',
      resource_id: 'contact-1',
      action: 'CREATE',
      actual_role: 'TENANT_OWNER',
      effective_role: 'TENANT_OWNER',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).toContain('s***@e***.com');
    expect(serialized).not.toContain('samantha');
    expect(serialized).not.toContain('Samantha');
    expect(serialized).not.toContain('example.com"');
    expect(serialized).toContain('consent_attested');
  });
});

describe('GET /api/contacts', () => {
  it('lists the tenant contacts in display name order, unsubscribed ones included', async () => {
    const context = make_routes_app();
    await add_contact(context, { display_name: 'bob', email_address: 'bob@example.com' });
    await add_contact(context, { display_name: 'Alice', email_address: 'alice@example.com' });
    await add_contact(context, { display_name: 'Carol', email_address: 'carol@example.com' });
    await context.contacts.mark_unsubscribed('t1', 'contact-3', 7, 'public');

    const response = await request(context.app)
      .get('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(
      response.body.data.contacts.map((c: { display_name: string; consent_status: string }) => [
        c.display_name,
        c.consent_status,
      ]),
    ).toEqual([
      ['Alice', 'GRANTED'],
      ['bob', 'GRANTED'],
      ['Carol', 'UNSUBSCRIBED'],
    ]);
    expect(response.body.data.contacts[2]).toMatchObject({
      unsubscribed_at: 7,
      consent_updated_at: 7,
    });
  });

  it('shows another tenant nothing of this tenant', async () => {
    const context = make_routes_app();
    await add_contact(context);

    const response = await request(context.app)
      .get('/api/contacts')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(200);
    expect(response.body.data.contacts).toEqual([]);
  });
});

describe('POST /api/contacts/import', () => {
  /**
   * Imports entries as the tenant-A owner.
   * @param context The routes app under test.
   * @param body Request body; defaults to an attested import.
   * @returns The supertest request.
   */
  function import_contacts(context: IRoutesApp, body: object) {
    return request(context.app)
      .post('/api/contacts/import')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ consent_attested: true, ...body });
  }

  it('adds valid rows, defaulting the name to the part before the @ and normalising addresses', async () => {
    const context = make_routes_app();

    const response = await import_contacts(context, {
      entries: [
        { display_name: 'Dana Lee', email_address: ' Dana@Example.com ' },
        { email_address: 'Pat.Jones@example.com' },
        { display_name: '  ', email_address: 'quinn@example.com' },
        { display_name: null, email_address: 'robin@example.com' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { added: 4, skipped_existing: 0, invalid: [] } });
    const contacts = await context.contacts.list_contacts('t1', {
      consent_status: null,
      limit: 10,
    });
    expect(contacts.map((c) => [c.display_name, c.email_address])).toEqual([
      ['Dana Lee', 'dana@example.com'],
      ['pat.jones', 'pat.jones@example.com'],
      ['quinn', 'quinn@example.com'],
      ['robin', 'robin@example.com'],
    ]);
  });

  it('reports invalid rows with their 1-based position and carries on with the rest', async () => {
    const context = make_routes_app();

    const response = await import_contacts(context, {
      entries: [
        { email_address: 'ok@example.com' },
        { email_address: 'not-an-email' },
        { email_address: 'inject@example.com\r\nBcc: evil@example.com' },
        { display_name: 'Name\nWith break', email_address: 'break@example.com' },
        { display_name: 'x'.repeat(101), email_address: 'long@example.com' },
        { email_address: 'fine@example.com' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.added).toBe(2);
    expect(response.body.data.invalid.map((row: { row: number }) => row.row)).toEqual([2, 3, 4, 5]);
    for (const row of response.body.data.invalid) {
      expect(typeof row.reason).toBe('string');
      expect(row.reason).not.toContain('@');
    }
    expect(await context.contacts.count_contacts('t1')).toBe(2);
  });

  it('counts known addresses, repeats within the request and opted-out addresses as skipped', async () => {
    const context = make_routes_app();
    await add_contact(context, { email_address: 'known@example.com' });
    await add_contact(context, { email_address: 'optout@example.com' });
    await context.contacts.mark_unsubscribed('t1', 'contact-2', 5, 'public');

    const response = await import_contacts(context, {
      entries: [
        { email_address: 'KNOWN@example.com' },
        { email_address: 'optout@example.com' },
        { email_address: 'new@example.com' },
        { email_address: 'New@Example.com' },
      ],
    });

    expect(response.body.data).toEqual({ added: 1, skipped_existing: 3, invalid: [] });
    expect((await context.contacts.get_contact('t1', 'contact-2'))?.consent_status).toBe(
      ConsentStatus.UNSUBSCRIBED,
    );
  });

  it.each([
    [
      'consent_attested missing',
      { entries: [{ email_address: 'a@example.com' }], consent_attested: undefined },
    ],
    [
      'consent_attested false',
      { entries: [{ email_address: 'a@example.com' }], consent_attested: false },
    ],
    ['no entries', { entries: [] }],
    [
      '201 entries',
      { entries: Array.from({ length: 201 }, (_, i) => ({ email_address: `u${i}@example.com` })) },
    ],
    ['an unknown entry field', { entries: [{ email_address: 'a@example.com', consent: true }] }],
    ['an entry without an address', { entries: [{ display_name: 'No address' }] }],
    ['a non-text address', { entries: [{ email_address: 5 }] }],
    ['an unknown field', { entries: [{ email_address: 'a@example.com' }], extra: 1 }],
  ])('answers 400, adding nothing, for %s', async (_label, body) => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/contacts/import')
      .set(auth(ROUTE_TOKENS.owner_a))
      .send({ consent_attested: true, ...body });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });

  it('accepts exactly 200 entries', async () => {
    const context = make_routes_app();

    const response = await import_contacts(context, {
      entries: Array.from({ length: 200 }, (_, i) => ({ email_address: `u${i}@example.com` })),
    });

    expect(response.body.data.added).toBe(200);
  });

  it('stops adding at the contact limit and reports the rest as invalid', async () => {
    const context = make_routes_app();
    for (let i = 0; i < CONTACT_LIMITS.MAX_CONTACTS_PER_TENANT - 1; i++) {
      await context.contacts.create_contact(make_contract_contact('t1', `seed-${i}`));
    }

    const response = await import_contacts(context, {
      entries: [{ email_address: 'a@example.com' }, { email_address: 'b@example.com' }],
    });

    expect(response.body.data.added).toBe(1);
    expect(response.body.data.invalid).toEqual([
      { row: 2, reason: 'The contact limit has been reached' },
    ]);
  });

  it('writes one audit row with counts and contact ids but no address or name', async () => {
    const context = make_routes_app();

    await import_contacts(context, {
      entries: [
        { display_name: 'Dana Lee', email_address: 'dana.lee@example.com' },
        { email_address: 'bad' },
      ],
    });

    expect(context.audit.rows).toHaveLength(1);
    expect(context.audit.rows[0]).toMatchObject({
      resource_type: 'contact_import',
      action: 'CREATE',
      user_id: 'u-owner-a',
      tenant_id: 't1',
    });
    const serialized = JSON.stringify(context.audit.rows);
    expect(serialized).toContain('contact-1');
    expect(serialized).not.toContain('dana');
    expect(serialized).not.toContain('Dana');
    expect(serialized).not.toContain('example.com');
  });

  it('is forbidden to a plain member and adds nothing', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .post('/api/contacts/import')
      .set(auth(ROUTE_TOKENS.member_a))
      .send({ entries: [{ email_address: 'a@example.com' }], consent_attested: true });

    expect(response.status).toBe(403);
    expect(await context.contacts.count_contacts('t1')).toBe(0);
  });
});

describe('DELETE /api/contacts/:contact_id', () => {
  it('deletes the contact and audits it with a masked address', async () => {
    const context = make_routes_app();
    await add_contact(context, { email_address: 'secret.person@example.com' });

    const response = await request(context.app)
      .delete('/api/contacts/contact-1')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { deleted: true } });
    expect(await context.contacts.get_contact('t1', 'contact-1')).toBeNull();
    const deletion = context.audit.rows[1];
    expect(deletion).toMatchObject({
      resource_type: 'contact',
      action: 'DELETE',
      resource_id: 'contact-1',
    });
    expect(JSON.stringify(deletion)).not.toContain('secret.person');
    expect(JSON.stringify(deletion)).toContain('s***@e***.com');
  });

  it('answers 404 for an unknown contact', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .delete('/api/contacts/nope')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('answers 404 for another tenant contact and leaves it alone', async () => {
    const context = make_routes_app();
    await add_contact(context);

    const response = await request(context.app)
      .delete('/api/contacts/contact-1')
      .set(auth(ROUTE_TOKENS.owner_b));

    expect(response.status).toBe(404);
    expect(await context.contacts.get_contact('t1', 'contact-1')).not.toBeNull();
  });

  it('answers 400 for an id that is not an id', async () => {
    const context = make_routes_app();

    const response = await request(context.app)
      .delete('/api/contacts/bad%20id')
      .set(auth(ROUTE_TOKENS.owner_a));

    expect(response.status).toBe(400);
  });
});
