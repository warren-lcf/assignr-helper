import { IConnection } from '../connections/models/connection.model.js';
import { IAccessTokenSource } from '../connections/ports/access_token_source.interface.js';
import { AssignrHttpClient } from '../integrations/assignr/assignr_http_client.js';
import { AssignrProvider } from '../integrations/assignr/assignr_provider.js';
import { AssignrRateBudget } from '../integrations/assignr/assignr_rate_budget.js';
import { IntegrationProvider } from '../integrations/enums/integration_provider.enum.js';
import { ISyncSession } from './models/sync_session.model.js';
import { IProviderSessionFactory } from './ports/provider_session_factory.interface.js';

/** Dependencies of the Assignr session factory; every one is injectable for tests. */
export interface IAssignrSessionFactoryOptions {
  token_source: IAccessTokenSource;
  fetch_impl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface ICachedAssignrSession {
  provider: AssignrProvider;
  rate_budget: AssignrRateBudget;
}

/**
 * Builds Assignr sessions. The provider, its HTTP client and its rate budget are
 * kept per connection for the life of the process, so the request budget and the
 * cached "my user ids" survive across manual and scheduled syncs on one instance.
 */
export class AssignrSessionFactory implements IProviderSessionFactory {
  private readonly cache = new Map<string, ICachedAssignrSession>();

  public constructor(private readonly options: IAssignrSessionFactoryOptions) {}

  /** @inheritdoc */
  public create_session(connection: IConnection): ISyncSession {
    if (connection.provider !== IntegrationProvider.ASSIGNR) {
      throw new Error(`Unsupported provider for this factory: ${connection.provider}`);
    }
    const cached = this.cached_session(connection);
    return {
      provider: cached.provider,
      ctx: {
        tenant_id: connection.tenant_id,
        connection_id: connection.connection_id,
        get_access_token: () => this.options.token_source.get_access_token(connection),
      },
      rate_limit_remaining: () => cached.rate_budget.last_remaining,
    };
  }

  private cached_session(connection: IConnection): ICachedAssignrSession {
    const key = JSON.stringify([connection.tenant_id, connection.connection_id]);
    const existing = this.cache.get(key);
    if (existing) return existing;

    const rate_budget = new AssignrRateBudget({
      now: this.options.now,
      sleep: this.options.sleep,
    });
    const http_client = new AssignrHttpClient({
      rate_budget,
      fetch_impl: this.options.fetch_impl,
      sleep: this.options.sleep,
    });
    const created = {
      rate_budget,
      provider: new AssignrProvider({ http_client, now: this.options.now }),
    };
    this.cache.set(key, created);
    return created;
  }
}
