import { describe, expect, it, vi } from 'vitest';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { AssignrCredentialsRejectedError } from '../integrations/assignr/errors/assignr_credentials_rejected_error.js';
import { AssignrTokenClient } from '../integrations/assignr/assignr_token_client.js';
import { ClientCredentialsTokenSource } from './client_credentials_token_source.js';
import { ConnectionNotAuthorizedError } from './errors/connection_not_authorized.error.js';
import { InMemoryCredentialVault } from './in_memory_credential_vault.js';
import { make_connection } from '../sync/make_connection.fixture.js';

function make_source(request_token = vi.fn()) {
  const vault = new InMemoryCredentialVault();
  const clock = { now: 0 };
  const token_client = { request_token } as unknown as AssignrTokenClient;
  const source = new ClientCredentialsTokenSource({ vault, token_client, now: () => clock.now });
  return { source, vault, clock, request_token };
}

const connection = make_connection();

describe('ClientCredentialsTokenSource', () => {
  it('has no token for a connection with no stored credentials', async () => {
    const { source, request_token } = make_source();

    await expect(source.get_access_token(connection)).rejects.toBeInstanceOf(
      ConnectionNotAuthorizedError,
    );
    expect(request_token).not.toHaveBeenCalled();
  });

  it('requests a token with the stored credentials and reuses it until it nears expiry', async () => {
    const { source, vault, clock, request_token } = make_source(
      vi.fn(async () => ({ access_token: 'tok-1', expires_at: 1_000_000 })),
    );
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });

    expect(await source.get_access_token(connection)).toBe('tok-1');
    clock.now = 500_000;
    expect(await source.get_access_token(connection)).toBe('tok-1');

    expect(request_token).toHaveBeenCalledTimes(1);
    expect(request_token).toHaveBeenCalledWith({ client_id: 'id', client_secret: 'secret' });
  });

  it('renews a token that is within two minutes of expiring', async () => {
    const request_token = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'old', expires_at: 1_000_000 })
      .mockResolvedValueOnce({ access_token: 'new', expires_at: 9_000_000 });
    const { source, vault, clock } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });
    await source.get_access_token(connection);

    clock.now = 1_000_000 - 119_000;

    expect(await source.get_access_token(connection)).toBe('new');
  });

  it('shares one token request between simultaneous callers', async () => {
    const request_token = vi.fn(async () => ({ access_token: 'tok', expires_at: 9_000_000 }));
    const { source, vault } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });

    const tokens = await Promise.all([
      source.get_access_token(connection),
      source.get_access_token(connection),
      source.get_access_token(connection),
    ]);

    expect(tokens).toEqual(['tok', 'tok', 'tok']);
    expect(request_token).toHaveBeenCalledTimes(1);
  });

  it('keeps tenants and connections apart', async () => {
    const request_token = vi.fn(async (credentials: { client_id: string }) => ({
      access_token: `tok-${credentials.client_id}`,
      expires_at: 9_000_000,
    }));
    const { source, vault } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'a', client_secret: 's' });
    await vault.write('t2', 'c1', { client_id: 'b', client_secret: 's' });

    expect(await source.get_access_token(connection)).toBe('tok-a');
    expect(await source.get_access_token(make_connection({ tenant_id: 't2' }))).toBe('tok-b');
  });

  it('turns rejected credentials into "needs reconnecting" and forgets the cached token', async () => {
    const request_token = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'tok', expires_at: 1_000_000 })
      .mockRejectedValueOnce(new AssignrCredentialsRejectedError());
    const { source, vault, clock } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });
    await source.get_access_token(connection);
    clock.now = 999_000;

    await expect(source.get_access_token(connection)).rejects.toBeInstanceOf(
      ConnectionNotAuthorizedError,
    );
  });

  it('passes other failures through so the sync records the real cause', async () => {
    const { source, vault } = make_source(
      vi.fn(async () => {
        throw new AssignrApiError('Assignr token endpoint 503', 503, null);
      }),
    );
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });

    await expect(source.get_access_token(connection)).rejects.toBeInstanceOf(AssignrApiError);
  });

  it('asks for a fresh token after it is invalidated', async () => {
    const request_token = vi
      .fn()
      .mockResolvedValueOnce({ access_token: 'one', expires_at: 9_000_000 })
      .mockResolvedValueOnce({ access_token: 'two', expires_at: 9_000_000 });
    const { source, vault } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });
    await source.get_access_token(connection);

    source.invalidate('t1', 'c1');

    expect(await source.get_access_token(connection)).toBe('two');
  });

  it('allows a new request after a failed one, rather than caching the failure', async () => {
    const request_token = vi
      .fn()
      .mockRejectedValueOnce(new AssignrApiError('503', 503, null))
      .mockResolvedValueOnce({ access_token: 'ok', expires_at: 9_000_000 });
    const { source, vault } = make_source(request_token);
    await vault.write('t1', 'c1', { client_id: 'id', client_secret: 'secret' });
    await source.get_access_token(connection).catch(() => undefined);

    expect(await source.get_access_token(connection)).toBe('ok');
  });
});
