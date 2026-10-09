import { ReasonCode } from '../enums/reason_code.enum';

/** English label for each reason a card is shown; translated where it is shown. */
export const REASON_LABEL: Readonly<Record<ReasonCode, string>> = {
  [ReasonCode.DISSENT]: 'Dissent',
  [ReasonCode.FOUL_PLAY]: 'Foul play',
  [ReasonCode.PERSISTENT_INFRINGEMENT]: 'Persistent infringement',
  [ReasonCode.UNSPORTING_BEHAVIOUR]: 'Unsporting behaviour',
  [ReasonCode.SERIOUS_FOUL_PLAY]: 'Serious foul play',
  [ReasonCode.VIOLENT_CONDUCT]: 'Violent conduct',
};

/** The reasons in the order the panel offers them. */
export const REASON_CHOICES: readonly ReasonCode[] = [
  ReasonCode.DISSENT,
  ReasonCode.FOUL_PLAY,
  ReasonCode.PERSISTENT_INFRINGEMENT,
  ReasonCode.UNSPORTING_BEHAVIOUR,
  ReasonCode.SERIOUS_FOUL_PLAY,
  ReasonCode.VIOLENT_CONDUCT,
];
