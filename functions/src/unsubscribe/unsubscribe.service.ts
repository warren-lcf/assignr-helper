import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { IStoredContact } from '../contacts/models/stored_contact.model.js';
import { IContactStore } from '../contacts/ports/contact_store.interface.js';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { mask_contact_email } from '../domain/email/mask_contact_email.js';
import { is_unsubscribe_token_authentic } from '../domain/unsubscribe/is_unsubscribe_token_authentic.js';
import { parse_unsubscribe_token } from '../domain/unsubscribe/parse_unsubscribe_token.js';
import { sign_unsubscribe_token } from '../domain/unsubscribe/sign_unsubscribe_token.js';
import { IUnsubscribeSubject } from '../domain/unsubscribe/unsubscribe_subject.model.js';
import { IUnsubscribePreview } from './models/unsubscribe_preview.model.js';
import { IUnsubscribeKeyProvider } from './ports/unsubscribe_key_provider.interface.js';

/** Who is recorded as the actor when a contact unsubscribes through their own link. */
export const UNSUBSCRIBE_ACTOR = 'system:public-unsubscribe';

/** Audit resource type shared with the owner's contact changes. */
const CONTACT_AUDIT_RESOURCE = 'contact';

/** Dependencies of the unsubscribe service. */
export interface IUnsubscribeServiceOptions {
  keys: IUnsubscribeKeyProvider;
  contacts: IContactStore;
  audit: AuditLogService;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
}

/**
 * Makes and honours the one-click unsubscribe links in every email. A link carries a stateless,
 * HMAC-signed token for one contact of one tenant; whoever holds it can withdraw that contact's
 * consent, and nobody can make one without the secret key. Looking at a link changes nothing
 * (mail scanners open links); only `unsubscribe` withdraws consent, and it is idempotent.
 */
export class UnsubscribeService {
  /**
   * Creates the service.
   * @param options Keys, contacts, audit log and clock.
   */
  public constructor(private readonly options: IUnsubscribeServiceOptions) {}

  /**
   * Loads the signing key now, so a send can fail before it starts rather than half way through.
   * @returns Resolves when the key is available.
   * @throws UnsubscribeKeyUnavailableError when it cannot be read or created.
   */
  public async prepare(): Promise<void> {
    await this.options.keys.get_signing_key();
  }

  /**
   * Makes the token for a contact's unsubscribe link.
   * @param tenant_id Owning tenant.
   * @param contact_id The contact.
   * @returns The token, safe to put in a URL path.
   * @throws UnsubscribeKeyUnavailableError when the signing key is not available.
   */
  public async issue_token(tenant_id: string, contact_id: string): Promise<string> {
    const key = await this.options.keys.get_signing_key();
    return sign_unsubscribe_token(
      { tenant_id, contact_id },
      this.options.keys.current_version,
      key,
    );
  }

  /**
   * Looks at a link without changing anything.
   * @param token Token from the URL.
   * @returns The masked address and whether the contact already unsubscribed, or null when the
   *   token is not valid or its contact no longer exists (the same answer for both).
   * @throws UnsubscribeKeyUnavailableError when the key for a well-formed token cannot be read.
   */
  public async describe(token: string): Promise<IUnsubscribePreview | null> {
    const contact = await this.find_contact(token);
    if (!contact) {
      return null;
    }
    return {
      email_masked: mask_contact_email(contact.email_address),
      already_unsubscribed: contact.consent_status === ConsentStatus.UNSUBSCRIBED,
    };
  }

  /**
   * Withdraws the contact's consent. Safe to repeat: the second call changes nothing and writes
   * no second audit row. The contact can never be subscribed again through any API.
   * @param token Token from the URL.
   * @returns True when the token was valid (whether or not this call changed anything), false when it was not.
   * @throws UnsubscribeKeyUnavailableError when the key for a well-formed token cannot be read.
   */
  public async unsubscribe(token: string): Promise<boolean> {
    const subject = await this.verify(token);
    if (!subject) {
      return false;
    }
    const result = await this.options.contacts.mark_unsubscribed(
      subject.tenant_id,
      subject.contact_id,
      this.options.now(),
      UNSUBSCRIBE_ACTOR,
    );
    if (!result) {
      return false;
    }
    if (result.changed) {
      await this.options.audit.write_audit_log({
        user_id: UNSUBSCRIBE_ACTOR,
        tenant_id: subject.tenant_id,
        resource_type: CONTACT_AUDIT_RESOURCE,
        resource_id: subject.contact_id,
        action: AuditAction.UPDATE,
        before_state: this.audit_state(result.before),
        after_state: this.audit_state(result.contact),
      });
    }
    return true;
  }

  /**
   * Checks a token's signature and finds its contact.
   * @param token Token from the URL.
   * @returns The contact, or null.
   */
  private async find_contact(token: string): Promise<IStoredContact | null> {
    const subject = await this.verify(token);
    if (!subject) {
      return null;
    }
    return this.options.contacts.get_contact(subject.tenant_id, subject.contact_id);
  }

  /**
   * Checks that a token is well formed and was signed by one of our keys.
   * @param token Token from the URL.
   * @returns Whom the token speaks for, or null.
   */
  private async verify(token: string): Promise<IUnsubscribeSubject | null> {
    const parsed = parse_unsubscribe_token(token);
    if (!parsed) {
      return null;
    }
    const key = await this.options.keys.get_verification_key(parsed.key_version);
    if (!key || !is_unsubscribe_token_authentic(parsed, key)) {
      return null;
    }
    return parsed.subject;
  }

  /** Audit state is a deliberate allow-list: ids, consent and a masked address. */
  private audit_state(contact: IStoredContact): object {
    return {
      contact_id: contact.contact_id,
      email_masked: mask_contact_email(contact.email_address),
      consent_status: contact.consent_status,
    };
  }
}
