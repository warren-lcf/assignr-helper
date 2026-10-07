import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { SyncRunStatus } from '../enums/sync_run_status.enum';
import { IStatusPresentation } from '../models/status_presentation.model';

/** Label, icon and tone for each sync run status. */
export const SYNC_RUN_STATUS_PRESENTATION: Readonly<Record<SyncRunStatus, IStatusPresentation>> = {
  [SyncRunStatus.RUNNING]: { label: 'Running', icon: 'sync', tone: StatusToneEnum.INFO },
  [SyncRunStatus.SUCCEEDED]: {
    label: 'Succeeded',
    icon: 'check_circle',
    tone: StatusToneEnum.SUCCESS,
  },
  [SyncRunStatus.FAILED]: { label: 'Failed', icon: 'error', tone: StatusToneEnum.ERROR },
  [SyncRunStatus.SKIPPED]: { label: 'Skipped', icon: 'skip_next', tone: StatusToneEnum.NEUTRAL },
};
