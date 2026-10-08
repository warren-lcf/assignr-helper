import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { IStatusPresentation } from '../../connections/models/status_presentation.model';
import { ConsentStatus } from '../enums/consent_status.enum';

/** Label, icon and tone for each consent status: text and an icon always, never colour alone. */
export const CONSENT_STATUS_PRESENTATION: Readonly<Record<ConsentStatus, IStatusPresentation>> = {
  [ConsentStatus.GRANTED]: {
    label: 'Granted',
    icon: 'check_circle',
    tone: StatusToneEnum.SUCCESS,
  },
  [ConsentStatus.UNSUBSCRIBED]: {
    label: 'Unsubscribed',
    icon: 'block',
    tone: StatusToneEnum.NEUTRAL,
  },
};
