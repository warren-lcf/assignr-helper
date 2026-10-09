import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';
import { IStatusPresentation } from '../../connections/models/status_presentation.model';
import { ReportStatus } from '../enums/report_status.enum';

/** Label, icon and tone for each report status: text and an icon always, never colour alone. */
export const REPORT_STATUS_PRESENTATION: Readonly<Record<ReportStatus, IStatusPresentation>> = {
  [ReportStatus.DRAFT]: { label: 'In progress', icon: 'edit_note', tone: StatusToneEnum.WARNING },
  [ReportStatus.READY]: { label: 'Ready', icon: 'check_circle', tone: StatusToneEnum.SUCCESS },
  [ReportStatus.SUBMITTED]: { label: 'Sent', icon: 'send', tone: StatusToneEnum.SUCCESS },
  [ReportStatus.NOT_SUPPORTED]: {
    label: 'Kept in this app',
    icon: 'inventory_2',
    tone: StatusToneEnum.NEUTRAL,
  },
};

/** Presentation of a game that has no report yet. */
export const NO_REPORT_PRESENTATION: IStatusPresentation = {
  label: 'Needs a report',
  icon: 'assignment_late',
  tone: StatusToneEnum.ERROR,
};
