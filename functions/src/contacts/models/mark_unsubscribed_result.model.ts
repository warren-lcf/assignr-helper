import { IStoredContact } from './stored_contact.model.js';

/** The outcome of unsubscribing a contact. */
export interface IMarkUnsubscribedResult {
  /** The contact as it is now (unsubscribed). */
  contact: IStoredContact;
  /** The contact as it was before; equal to `contact` when nothing changed. */
  before: IStoredContact;
  /** True only for the call that actually withdrew consent; false when already unsubscribed. */
  changed: boolean;
}
