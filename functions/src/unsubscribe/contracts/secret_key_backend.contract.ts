import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ISecretKeyBackend } from '../ports/secret_key_backend.interface.js';

/**
 * Registers the behaviour every {@link ISecretKeyBackend} must have.
 * @param label Name of the implementation under test.
 * @param make Factory returning a fresh backend.
 * @returns Nothing; registers a Vitest `describe`.
 */
export function describe_secret_key_backend_contract(
  label: string,
  make: () => ISecretKeyBackend,
): void {
  describe(`${label} secret key backend contract`, () => {
    it('reads null for a secret that does not exist', async () => {
      expect(await make().read(`missing-${randomUUID()}`)).toBeNull();
    });

    it('creates a secret once and reads it back', async () => {
      const backend = make();
      const id = `key-${randomUUID()}`;

      expect(await backend.create_if_absent(id, 'first')).toBe(true);

      expect(await backend.read(id)).toBe('first');
    });

    it('never overwrites an existing secret', async () => {
      const backend = make();
      const id = `key-${randomUUID()}`;
      await backend.create_if_absent(id, 'first');

      expect(await backend.create_if_absent(id, 'second')).toBe(false);

      expect(await backend.read(id)).toBe('first');
    });

    it('lets exactly one of several simultaneous creators win', async () => {
      const backend = make();
      const id = `key-${randomUUID()}`;

      const outcomes = await Promise.all(
        ['a', 'b', 'c', 'd', 'e'].map((value) => backend.create_if_absent(id, value)),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(1);
      expect(['a', 'b', 'c', 'd', 'e']).toContain(await backend.read(id));
    });
  });
}
