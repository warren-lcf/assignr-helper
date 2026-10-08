/** Whom an unsubscribe token speaks for: one contact of one tenant. */
export interface IUnsubscribeSubject {
  /** Owning tenant; letters, digits, `-` and `_` only. */
  tenant_id: string;
  /** The contact; letters, digits, `-` and `_` only. */
  contact_id: string;
}
