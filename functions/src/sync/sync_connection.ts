import { ProviderCapability } from '../integrations/enums/provider_capability.enum.js';
import { SyncKind } from './enums/sync_kind.enum.js';
import { ISyncDeps } from './models/sync_deps.model.js';
import { ISyncRun } from './models/sync_run.model.js';
import { plan_sync_window } from './plan_sync_window.js';
import { run_sync } from './run_sync.js';

/** Who and what a full connection sync is for. */
export interface ISyncConnectionRequest {
  tenant_id: string;
  connection_id: string;
  actor: string;
  /** Force an organizations refresh; otherwise it runs only when none are stored yet. */
  refresh_reference_data?: boolean;
}

/**
 * Runs every sync a connection needs, in order: organizations (first time or on
 * demand), open games when the provider supports them, then the account's own
 * games. Each run is recorded separately; one failing does not stop the next.
 * @param deps Injected dependencies.
 * @param request Connection to sync.
 * @returns The runs, in the order they were executed.
 */
export async function sync_connection(
  deps: ISyncDeps,
  request: ISyncConnectionRequest,
): Promise<ISyncRun[]> {
  const window = plan_sync_window(deps.now());
  const base = {
    tenant_id: request.tenant_id,
    connection_id: request.connection_id,
    actor: request.actor,
    window,
  };
  const runs: ISyncRun[] = [];

  const stored = await deps.organizations.list_organizations(
    request.tenant_id,
    request.connection_id,
  );
  if (request.refresh_reference_data || stored.length === 0) {
    runs.push(await run_sync(deps, { ...base, kind: SyncKind.REFERENCE_DATA }));
  }
  if (deps.provider.capabilities.has(ProviderCapability.OPEN_GAMES)) {
    runs.push(await run_sync(deps, { ...base, kind: SyncKind.OPEN_GAMES }));
  }
  runs.push(await run_sync(deps, { ...base, kind: SyncKind.MY_GAMES }));
  return runs;
}
