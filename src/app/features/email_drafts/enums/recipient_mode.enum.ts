/** Who a draft goes to. Mirrors the backend. */
export enum RecipientMode {
  /** Every contact who agreed and has not unsubscribed. */
  ALL_CONSENTED = 'ALL_CONSENTED',
  /** Only the contacts chosen on the draft. */
  SELECTED = 'SELECTED',
}
