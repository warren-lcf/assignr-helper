import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core';

/** What one position shows as: a label that names the position and its state, plus an icon and tone. */
export interface ISlotChip {
  /** Text such as "Referee: Open". */
  label: string;
  /** Material icon name; together with the label it carries the state without colour. */
  icon: string;
  tone: StatusToneEnum;
  /** True for a position that can still be taken. */
  is_open: boolean;
}
