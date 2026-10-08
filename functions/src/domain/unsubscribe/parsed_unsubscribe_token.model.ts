import { IUnsubscribeSubject } from './unsubscribe_subject.model.js';

/** An unsubscribe token taken apart but not yet checked against a key. */
export interface IParsedUnsubscribeToken {
  /** Which signing key made the token; selects the key to check it with. */
  key_version: number;
  subject: IUnsubscribeSubject;
  /** The 32 byte HMAC the token carries. */
  mac: Buffer;
  /** The bytes the HMAC covers, exactly as signed. */
  signed_bytes: Buffer;
}
