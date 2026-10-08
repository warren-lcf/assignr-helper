import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { is_unsubscribe_token_authentic } from './is_unsubscribe_token_authentic.js';
import { parse_unsubscribe_token } from './parse_unsubscribe_token.js';
import { sign_unsubscribe_token } from './sign_unsubscribe_token.js';

const KEY = Buffer.alloc(32, 7);
const SUBJECT = { tenant_id: 'tenant-1', contact_id: 'c0ffee00-1111-2222-3333-444455556666' };

describe('unsubscribe tokens', () => {
  it('round-trips the subject and the key version', () => {
    const token = sign_unsubscribe_token(SUBJECT, 1, KEY);

    const parsed = parse_unsubscribe_token(token);

    expect(parsed).not.toBeNull();
    expect(parsed?.subject).toEqual(SUBJECT);
    expect(parsed?.key_version).toBe(1);
    expect(parsed && is_unsubscribe_token_authentic(parsed, KEY)).toBe(true);
  });

  it('is URL safe and does not contain the plain contact id', () => {
    const token = sign_unsubscribe_token(SUBJECT, 1, KEY);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(SUBJECT.contact_id);
  });

  it('cannot be derived from the ids alone: another key gives another token that does not verify', () => {
    const other_key = randomBytes(32);
    const token = sign_unsubscribe_token(SUBJECT, 1, KEY);
    const forged = sign_unsubscribe_token(SUBJECT, 1, other_key);

    expect(forged).not.toBe(token);
    const parsed = parse_unsubscribe_token(forged);
    expect(parsed && is_unsubscribe_token_authentic(parsed, KEY)).toBe(false);
  });

  it('is deterministic for one subject, version and key', () => {
    expect(sign_unsubscribe_token(SUBJECT, 1, KEY)).toBe(sign_unsubscribe_token(SUBJECT, 1, KEY));
  });

  it('fails verification when the contact or tenant in the token is altered', () => {
    const token = sign_unsubscribe_token(SUBJECT, 1, KEY);
    const bytes = Buffer.from(token, 'base64url');
    const altered = Buffer.from(bytes);
    altered[2] = altered[2] ^ 0x01;

    const parsed = parse_unsubscribe_token(altered.toString('base64url'));

    expect(parsed === null || !is_unsubscribe_token_authentic(parsed, KEY)).toBe(true);
  });

  it('fails verification when the key version byte is altered', () => {
    const bytes = Buffer.from(sign_unsubscribe_token(SUBJECT, 1, KEY), 'base64url');
    bytes[0] = 2;

    const parsed = parse_unsubscribe_token(bytes.toString('base64url'));

    expect(parsed?.key_version).toBe(2);
    expect(parsed && is_unsubscribe_token_authentic(parsed, KEY)).toBe(false);
  });

  it('fails verification when the tag is altered', () => {
    const bytes = Buffer.from(sign_unsubscribe_token(SUBJECT, 1, KEY), 'base64url');
    bytes[bytes.length - 1] = bytes[bytes.length - 1] ^ 0xff;

    const parsed = parse_unsubscribe_token(bytes.toString('base64url'));

    expect(parsed && is_unsubscribe_token_authentic(parsed, KEY)).toBe(false);
  });

  it.each([
    '',
    'short',
    'a'.repeat(300),
    `${sign_unsubscribe_token(SUBJECT, 1, KEY)}=`,
    `${sign_unsubscribe_token(SUBJECT, 1, KEY)}!`,
    sign_unsubscribe_token(SUBJECT, 1, KEY).replace(/.$/, ' '),
    'A'.repeat(60),
    '../../etc/passwd'.padEnd(60, 'a'),
  ])('rejects the malformed token %j', (token) => {
    expect(parse_unsubscribe_token(token)).toBeNull();
  });

  it('rejects a token with extra payload parts or odd ids', () => {
    const make = (payload: string, version = 1) => {
      const signed = Buffer.concat([Buffer.from([version]), Buffer.from(payload, 'utf8')]);
      return Buffer.concat([signed, Buffer.alloc(32, 1)]).toString('base64url');
    };

    expect(parse_unsubscribe_token(make('t1:c1:extra'))).toBeNull();
    expect(parse_unsubscribe_token(make('t1c1'))).toBeNull();
    expect(parse_unsubscribe_token(make('t1:'))).toBeNull();
    expect(parse_unsubscribe_token(make(':c1'))).toBeNull();
    expect(parse_unsubscribe_token(make('t 1:c1'))).toBeNull();
    expect(parse_unsubscribe_token(make('t1:c1', 0))).toBeNull();
    expect(parse_unsubscribe_token(make('t1:c1'))).not.toBeNull();
  });

  it('refuses to sign ids that could break the payload and versions out of range', () => {
    expect(() => sign_unsubscribe_token({ tenant_id: 'a:b', contact_id: 'c' }, 1, KEY)).toThrow();
    expect(() => sign_unsubscribe_token({ tenant_id: 'a', contact_id: '' }, 1, KEY)).toThrow();
    expect(() => sign_unsubscribe_token(SUBJECT, 0, KEY)).toThrow('version');
    expect(() => sign_unsubscribe_token(SUBJECT, 256, KEY)).toThrow('version');
    expect(() => sign_unsubscribe_token(SUBJECT, 1.5, KEY)).toThrow('version');
  });

  it('keeps tokens for different tenants and contacts apart', () => {
    const a = sign_unsubscribe_token({ tenant_id: 'a', contact_id: 'bc' }, 1, KEY);
    const b = sign_unsubscribe_token({ tenant_id: 'ab', contact_id: 'c' }, 1, KEY);

    expect(a).not.toBe(b);
  });
});
