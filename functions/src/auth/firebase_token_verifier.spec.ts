import { describe, expect, it } from 'vitest';
import { FirebaseTokenVerifier, IFirebaseAuthLike } from './firebase_token_verifier.js';

function make_verifier(verify: IFirebaseAuthLike['verifyIdToken']): {
  verifier: FirebaseTokenVerifier;
  calls: unknown[][];
} {
  const calls: unknown[][] = [];
  const verifier = new FirebaseTokenVerifier(() => ({
    verifyIdToken: async (...args) => {
      calls.push(args);
      return verify(...args);
    },
  }));
  return { verifier, calls };
}

describe('FirebaseTokenVerifier', () => {
  it('returns the uid and email, and always checks revocation', async () => {
    const { verifier, calls } = make_verifier(async () => ({ uid: 'u1', email: 'a@b.test' }));

    expect(await verifier.verify('tok')).toEqual({ uid: 'u1', email: 'a@b.test' });
    expect(calls).toEqual([['tok', true]]);
  });

  it('reports a missing email as null', async () => {
    const { verifier } = make_verifier(async () => ({ uid: 'u1' }));

    expect(await verifier.verify('tok')).toEqual({ uid: 'u1', email: null });
  });

  it.each([
    'auth/id-token-expired',
    'auth/id-token-revoked',
    'auth/invalid-id-token',
    'auth/argument-error',
    'auth/user-disabled',
  ])('treats %s as a rejected token', async (code) => {
    const { verifier } = make_verifier(async () => {
      throw Object.assign(new Error('bad'), { code });
    });

    expect(await verifier.verify('tok')).toBeNull();
  });

  it('rethrows an error that is not about the token itself', async () => {
    const { verifier } = make_verifier(async () => {
      throw Object.assign(new Error('network'), { code: 'app/network-error' });
    });

    await expect(verifier.verify('tok')).rejects.toThrow('network');
  });

  it('rethrows an error without a code', async () => {
    const { verifier } = make_verifier(async () => {
      throw new Error('boom');
    });

    await expect(verifier.verify('tok')).rejects.toThrow('boom');
  });
});
