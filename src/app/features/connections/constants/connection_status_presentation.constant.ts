import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { ConnectionStatus } from '../enums/connection_status.enum';
import { IStatusPresentation } from '../models/status_presentation.model';

/** Label, icon and tone for each connection status. */
export const CONNECTION_STATUS_PRESENTATION: Readonly<
  Record<ConnectionStatus, IStatusPresentation>
> = {
  [ConnectionStatus.CONNECTED]: {
    label: 'Connected',
    icon: 'check_circle',
    tone: StatusToneEnum.SUCCESS,
  },
  [ConnectionStatus.NEEDS_ATTENTION]: {
    label: 'Needs attention',
    icon: 'warning',
    tone: StatusToneEnum.WARNING,
  },
  [ConnectionStatus.DISCONNECTED]: {
    label: 'Disconnected',
    icon: 'link_off',
    tone: StatusToneEnum.NEUTRAL,
  },
};
