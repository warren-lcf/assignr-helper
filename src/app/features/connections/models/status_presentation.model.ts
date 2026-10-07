import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core/status_chip';

/** How a status is drawn: text and an icon always, never colour alone. */
export interface IStatusPresentation {
  /** English label; translated where it is shown. */
  label: string;
  /** Material icon name. */
  icon: string;
  /** Chip tone. */
  tone: StatusToneEnum;
}
