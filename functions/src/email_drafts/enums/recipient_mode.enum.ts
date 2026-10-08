/** Who a draft is emailed to. */
export enum RecipientMode {
  /** Every contact whose consent is granted, worked out again at send time. */
  ALL_CONSENTED = 'ALL_CONSENTED',
  /** Only the contacts the owner picked (those still consenting at send time). */
  SELECTED = 'SELECTED',
}
