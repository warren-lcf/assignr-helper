import { IProviderContext } from '../../integrations/models/provider_context.model.js';
import { ISchedulingProvider } from '../../integrations/ports/scheduling_provider.interface.js';

/** Everything needed to talk to one connection's provider during a sync. */
export interface ISyncSession {
  provider: ISchedulingProvider;
  ctx: IProviderContext;
  /** Last rate-limit remaining the provider reported, for the run log. */
  rate_limit_remaining: () => number | null;
}
