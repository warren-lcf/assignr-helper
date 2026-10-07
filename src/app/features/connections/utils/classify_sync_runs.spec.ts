import { SyncOutcome } from '../enums/sync_outcome.enum';
import { FAILED_RUN, RUNNING_RUN, SKIPPED_RUN, SUCCEEDED_RUN } from '../mocks/sync_run_view.mock';
import { classify_sync_runs } from './classify_sync_runs';

describe('classify_sync_runs', () => {
  it('is a success when nothing failed, including no runs at all', () => {
    expect(classify_sync_runs([])).toBe(SyncOutcome.SUCCESS);
    expect(classify_sync_runs([SUCCEEDED_RUN, SKIPPED_RUN, RUNNING_RUN])).toBe(SyncOutcome.SUCCESS);
  });

  it('is partial when some steps failed and some succeeded', () => {
    expect(classify_sync_runs([SUCCEEDED_RUN, FAILED_RUN])).toBe(SyncOutcome.PARTIAL);
  });

  it('is failed when every step that ran failed', () => {
    expect(classify_sync_runs([FAILED_RUN])).toBe(SyncOutcome.FAILED);
    expect(classify_sync_runs([FAILED_RUN, SKIPPED_RUN])).toBe(SyncOutcome.FAILED);
  });
});
