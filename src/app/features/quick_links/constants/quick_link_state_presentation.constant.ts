import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { IStatusPresentation } from '../../connections/models/status_presentation.model';
import { QuickLinkState } from '../enums/quick_link_state.enum';

/** Label, icon and tone for each quick link state: text and an icon always, never colour alone. */
export const QUICK_LINK_STATE_PRESENTATION: Readonly<Record<QuickLinkState, IStatusPresentation>> =
  {
    [QuickLinkState.ACTIVE]: {
      label: 'Active',
      icon: 'check_circle',
      tone: StatusToneEnum.SUCCESS,
    },
    [QuickLinkState.EXPIRED]: {
      label: 'Expired',
      icon: 'schedule',
      tone: StatusToneEnum.WARNING,
    },
    [QuickLinkState.REVOKED]: {
      label: 'Revoked',
      icon: 'block',
      tone: StatusToneEnum.NEUTRAL,
    },
  };
