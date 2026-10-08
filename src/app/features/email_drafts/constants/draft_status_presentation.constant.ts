import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { IStatusPresentation } from '../../connections/models/status_presentation.model';
import { DraftStatus } from '../enums/draft_status.enum';

/** Label, icon and tone for each draft status: text and an icon always, never colour alone. */
export const DRAFT_STATUS_PRESENTATION: Readonly<Record<DraftStatus, IStatusPresentation>> = {
  [DraftStatus.DRAFT]: { label: 'Draft', icon: 'edit_note', tone: StatusToneEnum.NEUTRAL },
  [DraftStatus.SENDING]: { label: 'Sending', icon: 'schedule_send', tone: StatusToneEnum.INFO },
  [DraftStatus.SENT]: { label: 'Sent', icon: 'check_circle', tone: StatusToneEnum.SUCCESS },
  [DraftStatus.PARTIALLY_SENT]: {
    label: 'Partly sent',
    icon: 'warning',
    tone: StatusToneEnum.WARNING,
  },
};
