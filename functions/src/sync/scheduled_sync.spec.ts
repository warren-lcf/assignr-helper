import { describe, expect, it, vi } from 'vitest';
import { ConnectionSyncService } from './connection_sync.service.js';
import {
  SCHEDULED_SYNC_ACTOR,
  SCHEDULED_SYNC_BUDGET_MS,
  SCHEDULED_SYNC_CONNECTION_LIMIT,
  run_scheduled_sync,
} from './scheduled_sync.js';

describe('run_scheduled_sync', () => {
  it('syncs with the scheduler actor, the connection cap and the time budget, and logs a summary', async () => {
    const summary = { attempted: 3, succeeded: 2, failed: 1, deferred: 0 };
    const sync_all = vi.fn(async () => summary);
    const log_spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await run_scheduled_sync({ sync_all } as unknown as ConnectionSyncService);

    expect(result).toBe(summary);
    expect(sync_all).toHaveBeenCalledWith(
      SCHEDULED_SYNC_ACTOR,
      SCHEDULED_SYNC_CONNECTION_LIMIT,
      SCHEDULED_SYNC_BUDGET_MS,
    );
    expect(log_spy).toHaveBeenCalledWith('Scheduled sync finished', JSON.stringify(summary));
    log_spy.mockRestore();
  });

  it('keeps the budget below the 540 second function timeout', () => {
    expect(SCHEDULED_SYNC_BUDGET_MS).toBeLessThan(540_000);
    expect(SCHEDULED_SYNC_ACTOR).toBe('system:scheduler');
  });
});
