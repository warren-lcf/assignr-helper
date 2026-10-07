import { IntegrationProvider } from '../integrations/enums/integration_provider.enum.js';
import { ProviderCapability } from '../integrations/enums/provider_capability.enum.js';
import { IListGamesResult } from '../integrations/models/list_games_result.model.js';
import { INormalizedOrganization } from '../integrations/models/normalized_organization.model.js';
import { IProviderContext } from '../integrations/models/provider_context.model.js';
import { ISchedulingProvider } from '../integrations/ports/scheduling_provider.interface.js';
import { ISyncDeps } from './models/sync_deps.model.js';
import { ISyncRequest } from './models/sync_request.model.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { InMemoryGameStore } from './stores/in_memory_game_store.js';
import { InMemoryOrganizationStore } from './stores/in_memory_organization_store.js';
import { InMemorySyncRunStore } from './stores/in_memory_sync_run_store.js';
import { InMemoryVenueStore } from './stores/in_memory_venue_store.js';

/** A provider whose responses a spec controls. */
export class FakeSchedulingProvider implements ISchedulingProvider {
  public readonly provider = IntegrationProvider.ASSIGNR;
  public capabilities: ReadonlySet<ProviderCapability> = new Set([ProviderCapability.OPEN_GAMES]);
  public organizations: INormalizedOrganization[] = [];
  public open_result: IListGamesResult = empty_result();
  public my_result: IListGamesResult = empty_result();
  public failure: unknown = null;
  public calls: string[] = [];

  public async list_organizations(): Promise<INormalizedOrganization[]> {
    this.calls.push('list_organizations');
    if (this.failure) throw this.failure;
    return this.organizations;
  }

  public async list_open_games(): Promise<IListGamesResult> {
    this.calls.push('list_open_games');
    if (this.failure) throw this.failure;
    return this.open_result;
  }

  public async list_my_games(): Promise<IListGamesResult> {
    this.calls.push('list_my_games');
    if (this.failure) throw this.failure;
    return this.my_result;
  }

  public async get_game(): Promise<never> {
    throw new Error('not used in sync specs');
  }

  public async respond_to_assignment(): Promise<never> {
    throw new Error('not used in sync specs');
  }

  public async request_game(): Promise<never> {
    throw new Error('not used in sync specs');
  }
}

/**
 * Builds an empty, fully-trusted listing result.
 * @returns A result with no games and no completeness limits.
 */
export function empty_result(): IListGamesResult {
  return { games: [], skipped_count: 0, complete_organization_external_ids: null };
}

/** Everything a sync spec needs. */
export interface ISyncHarness {
  deps: ISyncDeps;
  provider: FakeSchedulingProvider;
  games: InMemoryGameStore;
  organizations: InMemoryOrganizationStore;
  venues: InMemoryVenueStore;
  runs: InMemorySyncRunStore;
  /** Moves the clock forward. */
  advance: (ms: number) => void;
  /** Current clock reading. */
  clock: () => number;
}

/**
 * Wires a fake provider to in-memory stores with a deterministic clock (each
 * reading advances one second) and sequential ids.
 * @returns The harness.
 */
export function make_sync_harness(): ISyncHarness {
  let time = 1_800_000_000_000;
  let counter = 0;
  const now = (): number => {
    time += 1000;
    return time;
  };
  const generate_id = (): string => `id-${++counter}`;
  const provider = new FakeSchedulingProvider();
  const games = new InMemoryGameStore();
  const organizations = new InMemoryOrganizationStore({ generate_id });
  const venues = new InMemoryVenueStore({ generate_id });
  const runs = new InMemorySyncRunStore();
  const ctx: IProviderContext = {
    tenant_id: 't1',
    connection_id: 'c1',
    get_access_token: async () => 'token',
  };
  return {
    deps: {
      provider,
      ctx,
      games,
      organizations,
      venues,
      runs,
      now,
      generate_id,
      rate_limit_remaining: () => 42,
    },
    provider,
    games,
    organizations,
    venues,
    runs,
    advance: (ms) => {
      time += ms;
    },
    clock: () => time,
  };
}

/**
 * Builds a sync request for the standard test tenant and connection.
 * @param kind Which sync to run.
 * @param overrides Fields to replace.
 * @returns The request.
 */
export function make_sync_request(
  kind: SyncKind,
  overrides: Partial<ISyncRequest> = {},
): ISyncRequest {
  return {
    tenant_id: 't1',
    connection_id: 'c1',
    kind,
    window: { start_at: Date.UTC(2026, 9, 1), end_at: Date.UTC(2026, 11, 31) },
    actor: 'system:sync',
    ...overrides,
  };
}
