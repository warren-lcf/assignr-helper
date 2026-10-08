import { describe, expect, it, vi } from 'vitest';
import { GoogleSecretKeyBackend, IGoogleSecretClientLike } from './google_secret_key_backend.js';

/**
 * Builds a fake Secret Manager client whose methods are spies.
 * @param overrides Methods to replace.
 * @returns The fake and its spies.
 */
function make_client(overrides: Record<string, unknown> = {}) {
  const spies = {
    accessSecretVersion: vi.fn(async () => [{ payload: { data: Buffer.from('stored-value') } }]),
    createSecret: vi.fn(async () => [{}]),
    addSecretVersion: vi.fn(async () => [{}]),
    deleteSecret: vi.fn(async () => [{}]),
    ...overrides,
  };
  return { spies, client: spies as unknown as IGoogleSecretClientLike };
}

const error_with_code = (code: number) => Object.assign(new Error('grpc'), { code });

describe('GoogleSecretKeyBackend', () => {
  it('makes no client until it is first used, then reuses one', async () => {
    const { client } = make_client();
    const make = vi.fn(() => client);
    const backend = new GoogleSecretKeyBackend('proj', make);

    expect(make).not.toHaveBeenCalled();
    await backend.read('a');
    await backend.read('b');

    expect(make).toHaveBeenCalledTimes(1);
  });

  it('reads the latest version of the named secret in the project', async () => {
    const { spies, client } = make_client();

    expect(await new GoogleSecretKeyBackend('proj', () => client).read('key-1')).toBe(
      'stored-value',
    );
    expect(spies.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/proj/secrets/key-1/versions/latest',
    });
  });

  it('reads a string payload as is and an empty payload as missing', async () => {
    const string_payload = make_client({
      accessSecretVersion: vi.fn(async () => [{ payload: { data: 'text' } }]),
    });
    const no_payload = make_client({ accessSecretVersion: vi.fn(async () => [{}]) });

    expect(await new GoogleSecretKeyBackend('p', () => string_payload.client).read('k')).toBe(
      'text',
    );
    expect(await new GoogleSecretKeyBackend('p', () => no_payload.client).read('k')).toBeNull();
  });

  it('reads NOT_FOUND as missing but rethrows any other failure', async () => {
    const missing = make_client({
      accessSecretVersion: vi.fn(async () => {
        throw error_with_code(5);
      }),
    });
    const denied = make_client({
      accessSecretVersion: vi.fn(async () => {
        throw error_with_code(7);
      }),
    });

    expect(await new GoogleSecretKeyBackend('p', () => missing.client).read('k')).toBeNull();
    await expect(new GoogleSecretKeyBackend('p', () => denied.client).read('k')).rejects.toThrow(
      'grpc',
    );
  });

  it('creates the secret with automatic replication and writes its first version', async () => {
    const { spies, client } = make_client();

    expect(
      await new GoogleSecretKeyBackend('proj', () => client).create_if_absent('key-1', 'v'),
    ).toBe(true);

    expect(spies.createSecret).toHaveBeenCalledWith({
      parent: 'projects/proj',
      secretId: 'key-1',
      secret: { replication: { automatic: {} } },
    });
    expect(spies.addSecretVersion).toHaveBeenCalledWith({
      parent: 'projects/proj/secrets/key-1',
      payload: { data: Buffer.from('v') },
    });
  });

  it('reports false and writes nothing when the secret already exists', async () => {
    const { spies, client } = make_client({
      createSecret: vi.fn(async () => {
        throw error_with_code(6);
      }),
    });

    expect(await new GoogleSecretKeyBackend('p', () => client).create_if_absent('k', 'v')).toBe(
      false,
    );
    expect(spies.addSecretVersion).not.toHaveBeenCalled();
  });

  it('rethrows a failure to create that is not ALREADY_EXISTS', async () => {
    const { client } = make_client({
      createSecret: vi.fn(async () => {
        throw error_with_code(7);
      }),
    });

    await expect(
      new GoogleSecretKeyBackend('p', () => client).create_if_absent('k', 'v'),
    ).rejects.toThrow('grpc');
  });

  it('removes a secret it created but could not fill, so a later attempt can start over', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { spies, client } = make_client({
      addSecretVersion: vi.fn(async () => {
        throw error_with_code(14);
      }),
    });

    await expect(
      new GoogleSecretKeyBackend('proj', () => client).create_if_absent('key-1', 'v'),
    ).rejects.toThrow('grpc');

    expect(spies.deleteSecret).toHaveBeenCalledWith({ name: 'projects/proj/secrets/key-1' });
    log.mockRestore();
  });

  it('still reports the original failure when the cleanup fails too', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { client } = make_client({
      addSecretVersion: vi.fn(async () => {
        throw error_with_code(14);
      }),
      deleteSecret: vi.fn(async () => {
        throw new Error('cannot delete');
      }),
    });

    await expect(
      new GoogleSecretKeyBackend('p', () => client).create_if_absent('k', 'v'),
    ).rejects.toThrow('grpc');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
