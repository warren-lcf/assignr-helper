import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { IStatusPresentation } from '../../connections/models/status_presentation.model';
import { SendResultStatus } from '../enums/send_result_status.enum';

/** Label, icon and tone for each per-recipient send result: text and an icon always, never colour alone. */
export const SEND_RESULT_STATUS_PRESENTATION: Readonly<
  Record<SendResultStatus, IStatusPresentation>
> = {
  [SendResultStatus.SENT]: { label: 'Sent', icon: 'check_circle', tone: StatusToneEnum.SUCCESS },
  [SendResultStatus.FAILED]: { label: 'Failed', icon: 'error', tone: StatusToneEnum.ERROR },
  [SendResultStatus.SKIPPED_UNSUBSCRIBED]: {
    label: 'Skipped: unsubscribed',
    icon: 'block',
    tone: StatusToneEnum.NEUTRAL,
  },
  [SendResultStatus.ALREADY_SENT]: {
    label: 'Already sent',
    icon: 'history',
    tone: StatusToneEnum.INFO,
  },
};
