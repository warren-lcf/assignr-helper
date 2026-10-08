import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsubscribeKeyUnavailableError } from './errors/unsubscribe_key_unavailable.error.js';
import { InMemorySecretKeyBackend } from './in_memory_secret_key_backend.js';
import {
  SecretManagerUnsubscribeKeys,
  unsubscribe_key_secret_id,
} from './secret_manager_unsubscribe_keys.js';

const FIXED_KEY = Buffer.alloc(32, 9);
const instant_wait = async (): Promise<void> => undefined;

describe('SecretManagerUnsubscribeKeys', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the secret by key version', () => {
    expect(unsubscribe_key_secret_id(1)).toBe('assignr-helper-unsubscribe-key-v1');
    expect(unsubscribe_key_secret_id(12)).toBe('assignr-helper-unsubscribe-key-v12');
  });

  it('creates the key with 32 random bytes on first use and stores it as base64', async () => {
    const backend = new InMemorySecretKeyBackend();
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    const key = await keys.get_signing_key();

    expect(key).toHaveLength(32);
    expect(backend.secrets.get('assignr-helper-unsubscribe-key-v1')).toBe(key.toString('base64'));
  });

  it('uses an existing key instead of creating another', async () => {
    const backend = new InMemorySecretKeyBackend();
    backend.secrets.set('assignr-helper-unsubscribe-key-v1', FIXED_KEY.toString('base64'));
    const generate_key = vi.fn(() => Buffer.alloc(32, 1));
    const keys = new SecretManagerUnsubscribeKeys({ backend, generate_key });

    expect(await keys.get_signing_key()).toEqual(FIXED_KEY);
    expect(generate_key).not.toHaveBeenCalled();
  });

  it('reads the store once per instance', async () => {
    const backend = new InMemorySecretKeyBackend();
    const read = vi.spyOn(backend, 'read');
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    await Promise.all([
      keys.get_signing_key(),
      keys.get_signing_key(),
      keys.get_verification_key(1),
    ]);
    await keys.get_signing_key();

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('gives every concurrently starting instance the same key: one creates, the rest read it', async () => {
    const backend = new InMemorySecretKeyBackend();
    // Simulates the creation window: the loser's first reads find the secret not yet readable.
    const original_read = backend.read.bind(backend);
    let racing_reads = 0;
    vi.spyOn(backend, 'read').mockImplementation(async (secret_id) => {
      racing_reads += 1;
      return racing_reads <= 5 ? null : original_read(secret_id);
    });
    let counter = 0;
    const instances = ['a', 'b', 'c', 'd', 'e'].map(
      () =>
        new SecretManagerUnsubscribeKeys({
          backend,
          wait: instant_wait,
          generate_key: () => Buffer.alloc(32, ++counter),
        }),
    );

    const loaded = await Promise.all(instances.map((instance) => instance.get_signing_key()));

    expect(new Set(loaded.map((key) => key.toString('hex'))).size).toBe(1);
    expect(backend.secrets.size).toBe(1);
  });

  it('waits for the winner to finish writing before giving up', async () => {
    const backend = new InMemorySecretKeyBackend();
    vi.spyOn(backend, 'create_if_absent').mockResolvedValue(false);
    let reads = 0;
    vi.spyOn(backend, 'read').mockImplementation(async () => {
      reads += 1;
      return reads >= 4 ? FIXED_KEY.toString('base64') : null;
    });
    const wait = vi.fn(instant_wait);
    const keys = new SecretManagerUnsubscribeKeys({ backend, wait, poll_interval_ms: 25 });

    expect(await keys.get_signing_key()).toEqual(FIXED_KEY);
    expect(wait).toHaveBeenCalledWith(25);
  });

  it('fails closed with a clear error when the secret exists but never becomes readable', async () => {
    const backend = new InMemorySecretKeyBackend();
    vi.spyOn(backend, 'create_if_absent').mockResolvedValue(false);
    const keys = new SecretManagerUnsubscribeKeys({ backend, wait: instant_wait, max_polls: 3 });

    const failure = await keys.get_signing_key().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UnsubscribeKeyUnavailableError);
    expect((failure as Error).message).toContain('assignr-helper-unsubscribe-key-v1');
  });

  it('fails closed when the store cannot be read, without hiding it as a missing key', async () => {
    const backend = new InMemorySecretKeyBackend();
    vi.spyOn(backend, 'read').mockRejectedValue(new Error('permission denied'));
    const create = vi.spyOn(backend, 'create_if_absent');
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    await expect(keys.get_signing_key()).rejects.toBeInstanceOf(UnsubscribeKeyUnavailableError);
    await expect(keys.get_verification_key(1)).rejects.toBeInstanceOf(
      UnsubscribeKeyUnavailableError,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('does not cache a failure: the next call tries again', async () => {
    const backend = new InMemorySecretKeyBackend();
    const read = vi.spyOn(backend, 'read').mockRejectedValueOnce(new Error('blip'));
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    await expect(keys.get_signing_key()).rejects.toBeInstanceOf(UnsubscribeKeyUnavailableError);
    expect(await keys.get_signing_key()).toHaveLength(32);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('refuses a stored key that is too short, and never echoes it', async () => {
    const backend = new InMemorySecretKeyBackend();
    backend.secrets.set(
      'assignr-helper-unsubscribe-key-v1',
      Buffer.from('short').toString('base64'),
    );
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    const failure = (await keys.get_signing_key().catch((error: unknown) => error)) as Error;

    expect(failure).toBeInstanceOf(UnsubscribeKeyUnavailableError);
    expect(failure.message).not.toContain('short');
  });

  it('knows only the supported versions: an unknown one is simply not valid', async () => {
    const backend = new InMemorySecretKeyBackend();
    const read = vi.spyOn(backend, 'read');
    const keys = new SecretManagerUnsubscribeKeys({ backend });

    expect(await keys.get_verification_key(2)).toBeNull();
    expect(await keys.get_verification_key(0)).toBeNull();
    expect(await keys.get_verification_key(255)).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it('supports rotation: signs with the new version and still verifies the old one', async () => {
    const backend = new InMemorySecretKeyBackend();
    backend.secrets.set('assignr-helper-unsubscribe-key-v1', FIXED_KEY.toString('base64'));
    const keys = new SecretManagerUnsubscribeKeys({
      backend,
      current_version: 2,
      supported_versions: [1, 2],
    });

    const signing = await keys.get_signing_key();

    expect(keys.current_version).toBe(2);
    expect(signing).not.toEqual(FIXED_KEY);
    expect(await keys.get_verification_key(1)).toEqual(FIXED_KEY);
    expect(await keys.get_verification_key(2)).toEqual(signing);
  });

  it('refuses to read a retired version that has no secret, rather than creating one', async () => {
    const backend = new InMemorySecretKeyBackend();
    const keys = new SecretManagerUnsubscribeKeys({
      backend,
      current_version: 2,
      supported_versions: [1, 2],
    });

    await expect(keys.get_verification_key(1)).rejects.toBeInstanceOf(
      UnsubscribeKeyUnavailableError,
    );
    expect(backend.secrets.has('assignr-helper-unsubscribe-key-v1')).toBe(false);
  });

  it('refuses a current version that is not supported', () => {
    expect(
      () =>
        new SecretManagerUnsubscribeKeys({
          backend: new InMemorySecretKeyBackend(),
          current_version: 2,
          supported_versions: [1],
        }),
    ).toThrow('supported');
  });
});
