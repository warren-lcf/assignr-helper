import { describe, expect, it, vi } from 'vitest';
import { ConnectionStatus } from '../connections/enums/connection_status.enum.js';
import { IConnection } from '../connections/models/connection.model.js';
import { IntegrationProvider } from '../integrations/enums/integration_provider.enum.js';
import { AssignrSessionFactory } from './assignr_session_factory.js';

function make_connection(overrides: Partial<IConnection> = {}): IConnection {
  return {
    tenant_id: 't1',
    connection_id: 'c1',
    provider: IntegrationProvider.ASSIGNR,
    status: ConnectionStatus.CONNECTED,
    account_label: null,
    external_account_id: null,
    secret_ref: null,
    scopes: [],
    last_sync_at: null,
    last_error: null,
    created_at: 1,
    created_by: 'a',
    updated_at: 1,
    updated_by: 'a',
    ...overrides,
  };
}

describe('AssignrSessionFactory', () => {
  it('builds a context for the connection that fetches its token on demand', async () => {
    const get_access_token = vi.fn(async () => 'tok-1');
    const factory = new AssignrSessionFactory({ token_source: { get_access_token } });
    const connection = make_connection();

    const session = factory.create_session(connection);

    expect(session.ctx).toMatchObject({ tenant_id: 't1', connection_id: 'c1' });
    expect(get_access_token).not.toHaveBeenCalled();
    expect(await session.ctx.get_access_token()).toBe('tok-1');
    expect(get_access_token).toHaveBeenCalledWith(connection);
    expect(session.rate_limit_remaining()).toBeNull();
  });

  it('reuses the provider for a connection but not across connections or tenants', () => {
    const factory = new AssignrSessionFactory({
      token_source: { get_access_token: async () => 't' },
    });

    const first = factory.create_session(make_connection());
    const again = factory.create_session(make_connection());
    const other_connection = factory.create_session(make_connection({ connection_id: 'c2' }));
    const other_tenant = factory.create_session(make_connection({ tenant_id: 't2' }));

    expect(again.provider).toBe(first.provider);
    expect(other_connection.provider).not.toBe(first.provider);
    expect(other_tenant.provider).not.toBe(first.provider);
  });

  it('refuses a provider it does not support', () => {
    const factory = new AssignrSessionFactory({
      token_source: { get_access_token: async () => 't' },
    });

    expect(() =>
      factory.create_session(make_connection({ provider: 'OTHER' as IntegrationProvider })),
    ).toThrow(/Unsupported provider/);
  });

  it('reports the rate-limit remaining that the provider session last saw', async () => {
    const fetch_impl = vi.fn(
      async () =>
        new Response(JSON.stringify({ _embedded: { sites: [] }, page: { next_page: null } }), {
          headers: { 'x-ratelimit-remaining': '123' },
        }),
    );
    const factory = new AssignrSessionFactory({
      token_source: { get_access_token: async () => 'tok' },
      fetch_impl: fetch_impl as unknown as typeof fetch,
    });
    const session = factory.create_session(make_connection());

    await session.provider.list_organizations(session.ctx);

    expect(session.rate_limit_remaining()).toBe(123);
  });
});
