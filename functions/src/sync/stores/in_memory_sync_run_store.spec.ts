import { describe, expect, it } from 'vitest';
import { SyncKind } from '../enums/sync_kind.enum.js';
import { SyncRunStatus } from '../enums/sync_run_status.enum.js';
import { ISyncRun } from '../models/sync_run.model.js';
import { InMemorySyncRunStore } from './in_memory_sync_run_store.js';

function make_run(overrides: Partial<ISyncRun> = {}): ISyncRun {
  return {
    tenant_id: 't1',
    run_id: 'r1',
    connection_id: 'c1',
    kind: SyncKind.OPEN_GAMES,
    window_start: null,
    window_end: null,
    status: SyncRunStatus.RUNNING,
    started_at: 1000,
    finished_at: null,
    seen_count: 0,
    created_count: 0,
    updated_count: 0,
    removed_count: 0,
    rate_limit_remaining: null,
    duration_ms: null,
    error: null,
    created_at: 1000,
    created_by: 'a',
    updated_at: 1000,
    updated_by: 'a',
    ...overrides,
  };
}

describe('InMemorySyncRunStore', () => {
  describe('save_run', () => {
    it('replaces a run with the same run_id', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run());
      await store.save_run(make_run({ status: SyncRunStatus.SUCCEEDED, seen_count: 5 }));

      const runs = await store.list_runs('t1', 'c1', 10);

      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({ status: SyncRunStatus.SUCCEEDED, seen_count: 5 });
    });

    it('stores a copy of the saved run', async () => {
      const store = new InMemorySyncRunStore();
      const run = make_run({ error: { name: 'E', message: 'm', status: null } });
      await store.save_run(run);

      run.status = SyncRunStatus.FAILED;
      run.error!.message = 'mutated';

      const [stored] = await store.list_runs('t1', 'c1', 10);
      expect(stored?.status).toBe(SyncRunStatus.RUNNING);
      expect(stored?.error?.message).toBe('m');
    });
  });

  describe('find_active_run', () => {
    it('returns a running run of the same tenant, connection and kind that started after the cutoff', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run());

      const found = await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 500);

      expect(found?.run_id).toBe('r1');
    });

    it('treats the cutoff as exclusive', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run({ started_at: 1000 }));

      expect(await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 1000)).toBeNull();
      expect(await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 999)).not.toBeNull();
    });

    it('ignores runs that are not running', async () => {
      const store = new InMemorySyncRunStore();
      for (const [index, status] of [
        SyncRunStatus.SUCCEEDED,
        SyncRunStatus.FAILED,
        SyncRunStatus.SKIPPED,
      ].entries()) {
        await store.save_run(make_run({ run_id: `r${index}`, status }));
      }

      expect(await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 0)).toBeNull();
    });

    it('ignores other kinds, tenants and connections', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run({ run_id: 'kind', kind: SyncKind.MY_GAMES }));
      await store.save_run(make_run({ run_id: 'tenant', tenant_id: 't2' }));
      await store.save_run(make_run({ run_id: 'conn', connection_id: 'c2' }));

      expect(await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 0)).toBeNull();
    });

    it('returns the newest matching run', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run({ run_id: 'older', started_at: 1000 }));
      await store.save_run(make_run({ run_id: 'newer', started_at: 2000 }));

      const found = await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 0);

      expect(found?.run_id).toBe('newer');
    });

    it('returns a copy', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run());

      const found = await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 0);
      found!.status = SyncRunStatus.FAILED;

      const again = await store.find_active_run('t1', 'c1', SyncKind.OPEN_GAMES, 0);
      expect(again?.status).toBe(SyncRunStatus.RUNNING);
    });
  });

  describe('list_runs', () => {
    it('orders newest first, ties by run_id, and applies the limit', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run({ run_id: 'old', started_at: 100 }));
      await store.save_run(make_run({ run_id: 'tie_b', started_at: 300 }));
      await store.save_run(make_run({ run_id: 'tie_a', started_at: 300 }));
      await store.save_run(make_run({ run_id: 'mid', started_at: 200 }));

      const all = await store.list_runs('t1', 'c1', 10);
      const limited = await store.list_runs('t1', 'c1', 2);

      expect(all.map((run) => run.run_id)).toEqual(['tie_a', 'tie_b', 'mid', 'old']);
      expect(limited.map((run) => run.run_id)).toEqual(['tie_a', 'tie_b']);
    });

    it('is scoped by tenant and connection', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run({ run_id: 'mine' }));
      await store.save_run(make_run({ run_id: 'tenant', tenant_id: 't2' }));
      await store.save_run(make_run({ run_id: 'conn', connection_id: 'c2' }));

      const runs = await store.list_runs('t1', 'c1', 10);

      expect(runs.map((run) => run.run_id)).toEqual(['mine']);
    });

    it('returns copies', async () => {
      const store = new InMemorySyncRunStore();
      await store.save_run(make_run());

      const [run] = await store.list_runs('t1', 'c1', 10);
      run!.seen_count = 99;

      const [again] = await store.list_runs('t1', 'c1', 10);
      expect(again?.seen_count).toBe(0);
    });
  });
});
