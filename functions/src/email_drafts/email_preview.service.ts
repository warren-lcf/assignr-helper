import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { mask_contact_email } from '../domain/email/mask_contact_email.js';
import { parse_email_address } from '../domain/email/parse_email_address.js';
import { EmailSettingsService } from '../email_settings/email_settings.service.js';
import { IEmailSender } from '../email_delivery/ports/email_sender.interface.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { DigestComposer } from './digest_composer.js';
import { EmailDraftService } from './email_draft.service.js';
import { EMAIL_DRAFT_LIMITS } from './email_draft_limits.constant.js';
import { DraftWarning } from './enums/draft_warning.enum.js';
import { EmailNotConfiguredError } from './errors/email_not_configured.error.js';
import { NoEmailOnAccountError } from './errors/no_email_on_account.error.js';
import { make_recipient_greeting } from './make_recipient_greeting.js';
import { IDraftPreview } from './models/draft_preview.model.js';
import { ITestSendTarget } from './models/test_send_target.model.js';
import { RecipientResolver } from './recipient_resolver.js';

/** Audit resource type for a test send; the resource id is the draft id. */
export const EMAIL_TEST_SEND_AUDIT_RESOURCE = 'email_draft_test_send';

/** Prefix on the subject of a test email. */
export const TEST_SUBJECT_PREFIX = '[TEST] ';

/** Printed at the top of a test email, because its links are placeholders. */
export const TEST_NOTICE =
  'TEST EMAIL: the links in this message are placeholders and do not work. Nothing was sent to your contacts.';

/** Dependencies of the email preview service. */
export interface IEmailPreviewServiceOptions {
  draft_service: EmailDraftService;
  recipients: RecipientResolver;
  composer: DigestComposer;
  settings: EmailSettingsService;
  sender: IEmailSender;
  audit: AuditLogService;
  /** The app's public origin, such as `https://assignr-helper-prod.web.app`, without a path. */
  public_app_origin: string;
}

/**
 * Shows an owner what a draft would send and who would get it, and sends a test copy to the
 * owner's own address. Both build the email from live data, with placeholder links, and neither
 * changes the draft, mints a quick link or contacts anyone but the owner.
 */
export class EmailPreviewService {
  /**
   * Creates the service.
   * @param options Collaborators.
   */
  public constructor(private readonly options: IEmailPreviewServiceOptions) {}

  /**
   * Previews a draft.
   * @param tenant_id Owning tenant.
   * @param draft_id Draft to preview.
   * @returns The rendered email, the counts and the warnings.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   */
  public async preview(tenant_id: string, draft_id: string): Promise<IDraftPreview> {
    const draft = await this.options.draft_service.get_draft(tenant_id, draft_id);
    const settings = await this.options.settings.get_for_sending(tenant_id);
    const [games, resolved] = await Promise.all([
      this.options.composer.load_games(tenant_id, draft.filters),
      this.options.recipients.resolve(tenant_id, draft),
    ]);
    const sample = resolved.eligible[0];
    const rendered = this.options.composer.render({
      content: draft,
      games,
      sender_name: settings?.from_name ?? null,
      postal_address: settings?.postal_address ?? null,
      recipient_greeting: sample ? make_recipient_greeting(sample.display_name) : null,
      quick_link_url: draft.include_quick_link ? this.placeholder_quick_link_url() : null,
      unsubscribe_url: this.placeholder_unsubscribe_url(),
    });

    const warnings: DraftWarning[] = [];
    if (settings === null) warnings.push(DraftWarning.EMAIL_NOT_CONFIGURED);
    if (games.games.length === 0) warnings.push(DraftWarning.NO_GAMES);
    if (resolved.eligible.length === 0) warnings.push(DraftWarning.NO_RECIPIENTS);
    if (resolved.eligible.length > EMAIL_DRAFT_LIMITS.MAX_RECIPIENTS_PER_SEND) {
      warnings.push(DraftWarning.TOO_MANY_RECIPIENTS);
    }
    if (settings !== null && settings.postal_address === null) {
      warnings.push(DraftWarning.NO_POSTAL_ADDRESS);
    }
    if (games.truncated) warnings.push(DraftWarning.GAMES_TRUNCATED);

    return {
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      game_count: games.games.length,
      eligible_recipient_count: resolved.eligible.length,
      skipped: { unsubscribed: resolved.unsubscribed_count, missing: resolved.missing_count },
      warnings,
    };
  }

  /**
   * Sends a test copy of a draft to the signed-in person's own verified address, and only there.
   * The subject starts with "[TEST] ", the links are placeholders, no quick link is made and the
   * draft is left exactly as it was.
   * @param actor Who is acting.
   * @param draft_id Draft to test.
   * @param target The signed-in account's address, from the verified token.
   * @returns Resolves once the vendor accepted the email.
   * @throws EmailNotConfiguredError when the tenant has no email settings.
   * @throws NoEmailOnAccountError when the account has no verified address.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   * @throws EmailDeliveryError when the vendor does not accept the email.
   */
  public async test_send(
    actor: IActingUser,
    draft_id: string,
    target: ITestSendTarget,
  ): Promise<void> {
    const settings = await this.options.settings.get_for_sending(actor.tenant_id);
    if (settings === null) {
      throw new EmailNotConfiguredError();
    }
    const to_email =
      target.email_verified && target.email ? parse_email_address(target.email) : null;
    if (to_email === null) {
      throw new NoEmailOnAccountError();
    }
    const draft = await this.options.draft_service.get_draft(actor.tenant_id, draft_id);
    const games = await this.options.composer.load_games(actor.tenant_id, draft.filters);
    const rendered = this.options.composer.render({
      content: { subject: `${TEST_SUBJECT_PREFIX}${draft.subject}`, intro: draft.intro },
      games,
      sender_name: settings.from_name,
      postal_address: settings.postal_address,
      recipient_greeting: TEST_NOTICE,
      quick_link_url: draft.include_quick_link ? this.placeholder_quick_link_url() : null,
      unsubscribe_url: this.placeholder_unsubscribe_url(),
    });

    try {
      await this.options.sender.send(
        { api_key: settings.api_key, from_email: settings.from_email },
        {
          to_email,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          from_name: settings.from_name,
          reply_to: settings.reply_to,
        },
      );
    } catch (error) {
      console.error('A test email could not be delivered', {
        draft_id,
        to: mask_contact_email(to_email),
        error_code: (error as { error_code?: unknown } | null)?.error_code ?? 'UNKNOWN',
      });
      throw error;
    }

    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: EMAIL_TEST_SEND_AUDIT_RESOURCE,
      resource_id: draft_id,
      action: AuditAction.CREATE,
      after_state: { draft_id, to_masked: mask_contact_email(to_email) },
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }

  private placeholder_quick_link_url(): string {
    return `${this.options.public_app_origin}/q/created-when-sent`;
  }

  private placeholder_unsubscribe_url(): string {
    return `${this.options.public_app_origin}/unsubscribe/per-recipient-link`;
  }
}
