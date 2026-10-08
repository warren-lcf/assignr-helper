import { describe, expect, it } from 'vitest';
import { contact_id_param_schema } from './contact_id_param.schema.js';
import { create_contact_body_schema } from './create_contact_body.schema.js';
import { import_contacts_body_schema } from './import_contacts_body.schema.js';

describe('create_contact_body_schema', () => {
  const valid = {
    display_name: ' Sam ',
    email_address: ' Sam@Example.com ',
    consent_attested: true,
  };

  it('trims the name and normalises the address', () => {
    expect(create_contact_body_schema.parse(valid)).toEqual({
      display_name: 'Sam',
      email_address: 'sam@example.com',
      consent_attested: true,
    });
  });

  it.each([false, 'true', 1, null, undefined])(
    'requires consent_attested to be literally true (%j)',
    (value) => {
      expect(
        create_contact_body_schema.safeParse({ ...valid, consent_attested: value }).success,
      ).toBe(false);
    },
  );

  it('points at the field and does not echo the address in the message', () => {
    const result = create_contact_body_schema.safeParse({ ...valid, email_address: 'bad@@' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['email_address']);
      expect(result.error.issues[0].message).not.toContain('bad');
    }
  });

  it('rejects unknown fields', () => {
    expect(create_contact_body_schema.safeParse({ ...valid, notes: 'x' }).success).toBe(false);
  });
});

describe('import_contacts_body_schema', () => {
  it('accepts rows as typed without judging them, so bad rows can be reported one by one', () => {
    const body = {
      entries: [
        { email_address: 'not an address' },
        { display_name: null, email_address: 'a@b.co' },
      ],
      consent_attested: true,
    };

    expect(import_contacts_body_schema.parse(body)).toEqual(body);
  });

  it.each([
    { entries: [], consent_attested: true },
    { entries: [{ email_address: 'a@b.co' }], consent_attested: false },
    { entries: [{ email_address: 'a@b.co' }] },
    { entries: [{ email_address: 'a'.repeat(1001) }], consent_attested: true },
    { entries: [{ display_name: 5, email_address: 'a@b.co' }], consent_attested: true },
  ])('rejects %j', (body) => {
    expect(import_contacts_body_schema.safeParse(body).success).toBe(false);
  });
});

describe('contact_id_param_schema', () => {
  it('accepts an id and rejects anything else', () => {
    expect(contact_id_param_schema.safeParse({ contact_id: 'c-1_A' }).success).toBe(true);
    expect(contact_id_param_schema.safeParse({ contact_id: 'a b' }).success).toBe(false);
    expect(contact_id_param_schema.safeParse({ contact_id: '' }).success).toBe(false);
  });
});
