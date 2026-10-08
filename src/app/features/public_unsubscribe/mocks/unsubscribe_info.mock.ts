import { IUnsubscribeInfo } from '../models/unsubscribe_info.model';

/** The secret a fixture link is opened with. Obviously fake. */
export const FAKE_UNSUBSCRIBE_TOKEN = 'fake-unsub-token-for-specs-0123456789';

/** A link for an address that is still subscribed. */
export const READY_INFO: IUnsubscribeInfo = {
  email_masked: 'a***@example.test',
  already_unsubscribed: false,
};

/** A link for an address that already unsubscribed. */
export const ALREADY_INFO: IUnsubscribeInfo = {
  email_masked: 'a***@example.test',
  already_unsubscribed: true,
};
