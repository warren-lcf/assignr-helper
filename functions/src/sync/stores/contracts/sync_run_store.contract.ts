import { describe, expect, it } from 'vitest';
import { SyncKind } from '../../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../../enums/sync_run_status.enum.js';
import { ISyncRunStore } from '../../ports/sync_run_store.interface.js';
import { make_contract_run } from './make_contract_run.js';
import { make_contract_tenant_id } from './make_contract_tenant_id.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Registers the behavioural contract every `ISyncRunStore` must satisfy. Each test works in
 * a fresh random tenant, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_sync_run_store_contract(label: string, make: () => ISyncRunStore): void {
  describe(`${label} sync run store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('save_run', () => {
      it('round-trips every field of a finished run', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const run = make_contract_run(tenant_id, 'r1', {
          kind: SyncKind.MY_GAMES,
          window_start: 1786147200000,
          window_end: 1788739200000,
          status: SyncRunStatus.FAILED,
          started_at: 1786234975000,
          finished_at: 1786234981500,
          seen_count: 120,
          created_count: 5,
          updated_count: 7,
          removed_count: 2,
          rate_limit_remaining: 58,
          duration_ms: 6500,
          error: { name: 'ProviderError', message: 'Rate limited "now"', status: 429 },
          created_at: 1786234975000,
          created_by: 'creator',
          updated_at: 1786234981500,
          updated_by: 'updater',
        });

        await store.save_run(run);

        expect(await store.list_runs(tenant_id, 'c1', 10)).toEqual([run]);
      });

      it('round-trips a run with null optional fields and an error without a status', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const plain = make_contract_run(tenant_id, 'plain', { started_at: 2000 });
        const failed = make_contract_run(tenant_id, 'failed', {
          started_at: 1000,
          error: { name: 'E', message: 'm', status: null },
        });

        await store.save_run(plain);
        await store.save_run(failed);

        expect(await store.list_runs(tenant_id, 'c1', 10)).toEqual([plain, failed]);
      });

      it('replaces a run with the same run_id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));
        await store.save_run(
          make_contract_run(tenant_id, 'r1', {
            status: SyncRunStatus.SUCCEEDED,
            seen_count: 5,
            error: { name: 'E', message: 'm', status: 500 },
          }),
        );
        await store.save_run(
          make_contract_run(tenant_id, 'r1', { status: SyncRunStatus.SUCCEEDED, seen_count: 6 }),
        );

        const runs = await store.list_runs(tenant_id, 'c1', 10);

        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({
          status: SyncRunStatus.SUCCEEDED,
          seen_count: 6,
          error: null,
        });
      });

      it('stores a copy of the saved run', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const run = make_contract_run(tenant_id, 'r1', {
          error: { name: 'E', message: 'm', status: null },
        });
        await store.save_run(run);

        run.status = SyncRunStatus.FAILED;
        run.error!.message = 'mutated';

        const [stored] = await store.list_runs(tenant_id, 'c1', 10);
        expect(stored?.status).toBe(SyncRunStatus.RUNNING);
        expect(stored?.error?.message).toBe('m');
      });
    });

    describe('find_active_run', () => {
      it('returns a running run of the same tenant, connection and kind that started after the cutoff', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));

        const found = await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 500);

        expect(found?.run_id).toBe('r1');
      });

      it('returns the complete run', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const run = make_contract_run(tenant_id, 'r1', {
          window_start: 10,
          window_end: 20,
          rate_limit_remaining: 3,
          error: { name: 'E', message: 'm', status: null },
        });
        await store.save_run(run);

        expect(await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0)).toEqual(run);
      });

      it('treats the cutoff as exclusive', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1', { started_at: 1000 }));

        expect(await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 1000)).toBeNull();
        expect(
          await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 999),
        ).not.toBeNull();
      });

      it('compares the cutoff in epoch milliseconds', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const started_at = 1786234975000;
        await store.save_run(make_contract_run(tenant_id, 'r1', { started_at }));

        expect(
          await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, started_at),
        ).toBeNull();
        expect(
          await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, started_at - 1),
        ).not.toBeNull();
      });

      it('ignores runs that are not running', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        for (const [index, status] of [
          SyncRunStatus.SUCCEEDED,
          SyncRunStatus.FAILED,
          SyncRunStatus.SKIPPED,
        ].entries()) {
          await store.save_run(make_contract_run(tenant_id, `r${index}`, { status }));
        }

        expect(await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0)).toBeNull();
      });

      it('ignores other kinds, tenants and connections', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'kind', { kind: SyncKind.MY_GAMES }));
        await store.save_run(make_contract_run(other_tenant_id, 'tenant'));
        await store.save_run(make_contract_run(tenant_id, 'conn', { connection_id: 'c2' }));

        expect(await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0)).toBeNull();
      });

      it('returns the newest matching run', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'older', { started_at: 1000 }));
        await store.save_run(make_contract_run(tenant_id, 'newer', { started_at: 2000 }));

        const found = await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0);

        expect(found?.run_id).toBe('newer');
      });

      it('breaks a start-time tie by the smallest run_id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'tie_b', { started_at: 1000 }));
        await store.save_run(make_contract_run(tenant_id, 'tie_a', { started_at: 1000 }));

        const found = await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0);

        expect(found?.run_id).toBe('tie_a');
      });

      it('stops reporting a run as active once it is saved as finished', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));
        await store.save_run(
          make_contract_run(tenant_id, 'r1', { status: SyncRunStatus.SUCCEEDED }),
        );

        expect(await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0)).toBeNull();
      });

      it('returns a copy', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));

        const found = await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0);
        found!.status = SyncRunStatus.FAILED;

        const again = await store.find_active_run(tenant_id, 'c1', SyncKind.OPEN_GAMES, 0);
        expect(again?.status).toBe(SyncRunStatus.RUNNING);
      });
    });

    describe('list_runs', () => {
      it('orders newest first, ties by run_id, and applies the limit', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'old', { started_at: 100 }));
        await store.save_run(make_contract_run(tenant_id, 'tie_b', { started_at: 300 }));
        await store.save_run(make_contract_run(tenant_id, 'tie_a', { started_at: 300 }));
        await store.save_run(make_contract_run(tenant_id, 'mid', { started_at: 200 }));

        const all = await store.list_runs(tenant_id, 'c1', 10);
        const limited = await store.list_runs(tenant_id, 'c1', 2);

        expect(all.map((run) => run.run_id)).toEqual(['tie_a', 'tie_b', 'mid', 'old']);
        expect(limited.map((run) => run.run_id)).toEqual(['tie_a', 'tie_b']);
      });

      it('returns no rows for a limit of zero', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));

        expect(await store.list_runs(tenant_id, 'c1', 0)).toEqual([]);
      });

      it('returns nothing for a tenant that has no runs', async () => {
        const store = make();

        expect(await store.list_runs(make_contract_tenant_id(), 'c1', 10)).toEqual([]);
      });

      it('is scoped by tenant and connection', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const other_tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'mine'));
        await store.save_run(make_contract_run(other_tenant_id, 'tenant'));
        await store.save_run(make_contract_run(tenant_id, 'conn', { connection_id: 'c2' }));

        const runs = await store.list_runs(tenant_id, 'c1', 10);

        expect(runs.map((run) => run.run_id)).toEqual(['mine']);
      });

      it('returns copies', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.save_run(make_contract_run(tenant_id, 'r1'));

        const [run] = await store.list_runs(tenant_id, 'c1', 10);
        run!.seen_count = 99;

        const [again] = await store.list_runs(tenant_id, 'c1', 10);
        expect(again?.seen_count).toBe(0);
      });
    });
  });
}
