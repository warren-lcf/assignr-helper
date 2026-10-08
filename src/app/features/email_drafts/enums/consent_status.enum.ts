/** Whether a contact agreed to receive these emails. Mirrors the backend. */
export enum ConsentStatus {
  /** The contact agreed and has not withdrawn. */
  GRANTED = 'GRANTED',
  /** The contact used the unsubscribe link; never email them again. */
  UNSUBSCRIBED = 'UNSUBSCRIBED',
}
