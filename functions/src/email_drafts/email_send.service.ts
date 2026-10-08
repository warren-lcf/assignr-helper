import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { ConsentStatus } from '../contacts/enums/consent_status.enum.js';
import { IStoredContact } from '../contacts/models/stored_contact.model.js';
import { IContactStore } from '../contacts/ports/contact_store.interface.js';
import { mask_contact_email } from '../domain/email/mask_contact_email.js';
import { EmailSettingsService } from '../email_settings/email_settings.service.js';
import { DeliveryErrorCode } from '../email_delivery/enums/delivery_error_code.enum.js';
import { EmailDeliveryError } from '../email_delivery/errors/email_delivery.error.js';
import { IEmailCredentials } from '../email_delivery/models/email_credentials.model.js';
import { IEmailSender } from '../email_delivery/ports/email_sender.interface.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { QuickLinkService } from '../quick_links/quick_link.service.js';
import { UnsubscribeService } from '../unsubscribe/unsubscribe.service.js';
import { build_quick_link_scope } from './build_quick_link_scope.js';
import { DigestComposer } from './digest_composer.js';
import { EMAIL_DRAFT_AUDIT_RESOURCE, EmailDraftService } from './email_draft.service.js';
import { EMAIL_DRAFT_LIMITS } from './email_draft_limits.constant.js';
import { BeginSendOutcome } from './enums/begin_send_outcome.enum.js';
import { DeliveryStatus } from './enums/delivery_status.enum.js';
import { DraftStatus } from './enums/draft_status.enum.js';
import { SendResultStatus } from './enums/send_result_status.enum.js';
import { DraftLockedError } from './errors/draft_locked.error.js';
import { EmailDraftNotFoundError } from './errors/email_draft_not_found.error.js';
import { EmailNotConfiguredError } from './errors/email_not_configured.error.js';
import { NoGamesError } from './errors/no_games.error.js';
import { NoRecipientsError } from './errors/no_recipients.error.js';
import { RecipientCountChangedError } from './errors/recipient_count_changed.error.js';
import { TooManyRecipientsError } from './errors/too_many_recipients.error.js';
import { make_recipient_greeting } from './make_recipient_greeting.js';
import { IDraftGameSnapshot } from './models/draft_game_snapshot.model.js';
import { ILoadedDigestGames } from './models/loaded_digest_games.model.js';
import { ISendDraftResult } from './models/send_draft_result.model.js';
import { ISendResultRow } from './models/send_result_row.model.js';
import { IStoredEmailDraft } from './models/stored_email_draft.model.js';
import { IEmailDeliveryStore } from './ports/email_delivery_store.interface.js';
import { IEmailDraftStore } from './ports/email_draft_store.interface.js';
import { RecipientResolver } from './recipient_resolver.js';
import { run_with_concurrency } from './run_with_concurrency.js';

/** Dependencies of the email send service. */
export interface IEmailSendServiceOptions {
  draft_service: EmailDraftService;
  drafts: IEmailDraftStore;
  deliveries: IEmailDeliveryStore;
  contacts: IContactStore;
  recipients: RecipientResolver;
  composer: DigestComposer;
  settings: EmailSettingsService;
  sender: IEmailSender;
  quick_links: QuickLinkService;
  unsubscribe: UnsubscribeService;
  audit: AuditLogService;
  /** The app's public origin, such as `https://assignr-helper-prod.web.app`, without a path. */
  public_app_origin: string;
  /** Clock returning the current instant in UTC milliseconds. */
  now: () => number;
  /** Emails sent at once; defaults to 5. */
  concurrency?: number;
  /** Time one send may spend delivering before it stops; defaults to 240 seconds. */
  time_budget_ms?: number;
  /** How long a SENDING lock stands before another request may take it over; defaults to 10 minutes. */
  stale_after_ms?: number;
}

/** What one send is working with once it holds the lock. */
interface ISendContext {
  actor: IActingUser;
  draft: IStoredEmailDraft;
  credentials: IEmailCredentials;
  from_name: string | null;
  reply_to: string | null;
  postal_address: string | null;
  games: ILoadedDigestGames;
  quick_link_url: string | null;
  started_at: number;
  /** Set when the vendor refuses the key or sender, so the remaining recipients are not tried. */
  abort_code: DeliveryErrorCode | null;
}

/**
 * Sends a draft to its recipients. Every safety rule is enforced here, on the server: email must
 * be configured; only consented, not-unsubscribed contacts are emailed (re-checked for each one
 * just before sending); the owner's confirmed count must match the recomputed one; an empty
 * digest is never sent; and the draft is locked with a compare-and-swap so a double click or a
 * second request cannot send it twice. Results are recorded per recipient (contact id and a safe
 * error code only), so a partly sent draft can be sent again and only the recipients without a
 * delivered email are retried.
 */
export class EmailSendService {
  private readonly concurrency: number;
  private readonly time_budget_ms: number;
  private readonly stale_after_ms: number;

  /**
   * Creates the service.
   * @param options Collaborators and optional tuning.
   */
  public constructor(private readonly options: IEmailSendServiceOptions) {
    this.concurrency = options.concurrency ?? EMAIL_DRAFT_LIMITS.SEND_CONCURRENCY;
    this.time_budget_ms = options.time_budget_ms ?? EMAIL_DRAFT_LIMITS.SEND_TIME_BUDGET_MS;
    this.stale_after_ms = options.stale_after_ms ?? EMAIL_DRAFT_LIMITS.SENDING_STALE_AFTER_MS;
  }

  /**
   * Sends a draft.
   * @param actor Who is acting.
   * @param draft_id Draft to send.
   * @param confirm_recipient_count The recipient count the owner saw and agreed to.
   * @returns The overall status and a result for every recipient.
   * @throws EmailNotConfiguredError when the tenant has no email settings.
   * @throws EmailDraftNotFoundError when the tenant has no such draft.
   * @throws NoRecipientsError, TooManyRecipientsError or RecipientCountChangedError when the audience is not acceptable.
   * @throws NoGamesError when no open game matches the draft.
   * @throws DraftLockedError when the draft is already sending or sent.
   * @throws UnsubscribeKeyUnavailableError when links cannot be signed; nothing is sent.
   */
  public async send(
    actor: IActingUser,
    draft_id: string,
    confirm_recipient_count: number,
  ): Promise<ISendDraftResult> {
    const settings = await this.options.settings.get_for_sending(actor.tenant_id);
    if (settings === null) {
      throw new EmailNotConfiguredError();
    }
    const draft = await this.options.draft_service.get_draft(actor.tenant_id, draft_id);
    if (draft.status === DraftStatus.SENT) {
      throw new DraftLockedError(draft_id);
    }

    const resolved = await this.options.recipients.resolve(actor.tenant_id, draft);
    const eligible = resolved.eligible;
    if (eligible.length === 0) {
      throw new NoRecipientsError();
    }
    if (eligible.length > EMAIL_DRAFT_LIMITS.MAX_RECIPIENTS_PER_SEND) {
      throw new TooManyRecipientsError(eligible.length, EMAIL_DRAFT_LIMITS.MAX_RECIPIENTS_PER_SEND);
    }
    if (confirm_recipient_count !== eligible.length) {
      throw new RecipientCountChangedError(eligible.length, confirm_recipient_count);
    }
    const games = await this.options.composer.load_games(actor.tenant_id, draft.filters);
    if (games.games.length === 0) {
      throw new NoGamesError();
    }
    // Fail before locking when links cannot be signed, so a broken key never half-sends a draft.
    await this.options.unsubscribe.prepare();

    const began = await this.options.drafts.begin_send(
      actor.tenant_id,
      draft_id,
      this.options.now(),
      actor.user_id,
      this.stale_after_ms,
    );
    if (began.outcome === BeginSendOutcome.NOT_FOUND) {
      throw new EmailDraftNotFoundError(draft_id);
    }
    if (began.outcome === BeginSendOutcome.NOT_SENDABLE || !began.draft) {
      throw new DraftLockedError(draft_id);
    }

    // From here the draft is SENDING and this request owns it.
    let context: ISendContext;
    let already_sent: Set<string>;
    let quick_link_id: string | null = null;
    try {
      const quick_link = await this.mint_quick_link(actor, began.draft);
      quick_link_id = quick_link?.link_id ?? null;
      await this.options.drafts.replace_draft_games(
        actor.tenant_id,
        draft_id,
        games.games.map((game): IDraftGameSnapshot => ({ game_id: game.game_id, game })),
        this.options.now(),
        actor.user_id,
      );
      already_sent = new Set(
        (await this.options.deliveries.list_recipients(actor.tenant_id, draft_id))
          .filter((row) => row.status === DeliveryStatus.SENT)
          .map((row) => row.contact_id),
      );
      context = {
        actor,
        draft: began.draft,
        credentials: { api_key: settings.api_key, from_email: settings.from_email },
        from_name: settings.from_name,
        reply_to: settings.reply_to,
        postal_address: settings.postal_address,
        games,
        quick_link_url: quick_link
          ? `${this.options.public_app_origin}/q/${quick_link.token}`
          : null,
        started_at: this.options.now(),
        abort_code: null,
      };
    } catch (error) {
      // Nothing has been delivered yet, so put the draft back as it was and do not leave a live
      // link behind that no email carries.
      await this.revoke_unused_link(actor, quick_link_id);
      await this.revert(actor, draft_id, began.revert_to);
      throw error;
    }

    const results = new Map<string, ISendResultRow>();
    const to_send: IStoredContact[] = [];
    for (const contact of eligible) {
      if (already_sent.has(contact.contact_id)) {
        results.set(contact.contact_id, {
          contact_id: contact.contact_id,
          status: SendResultStatus.ALREADY_SENT,
          error_code: null,
        });
      } else {
        to_send.push(contact);
      }
    }
    await run_with_concurrency(to_send, this.concurrency, async (contact) => {
      results.set(contact.contact_id, await this.deliver_one(context, contact));
    });

    const ordered: ISendResultRow[] = [
      ...eligible.map((contact) => results.get(contact.contact_id) as ISendResultRow),
      ...resolved.skipped_unsubscribed.map((contact): ISendResultRow => ({
        contact_id: contact.contact_id,
        status: SendResultStatus.SKIPPED_UNSUBSCRIBED,
        error_code: null,
      })),
    ];
    const sent_now = ordered.filter((row) => row.status === SendResultStatus.SENT);
    const failed = ordered.filter((row) => row.status === SendResultStatus.FAILED);
    const delivered = new Set([...already_sent, ...sent_now.map((row) => row.contact_id)]);
    // SENT once nobody is left to retry: every eligible contact was delivered to, or unsubscribed
    // while the send was under way. Only a failure leaves the draft PARTIALLY_SENT.
    const status = eligible.every((contact) => {
      const row = results.get(contact.contact_id);
      return (
        delivered.has(contact.contact_id) || row?.status === SendResultStatus.SKIPPED_UNSUBSCRIBED
      );
    })
      ? DraftStatus.SENT
      : DraftStatus.PARTIALLY_SENT;

    await this.finish(actor, draft, {
      status,
      recipient_count: delivered.size,
      quick_link_id,
      sent_at: sent_now.length > 0 ? this.options.now() : null,
      counts: {
        eligible: eligible.length,
        sent: sent_now.length,
        failed: failed.length,
        skipped_unsubscribed: ordered.filter(
          (row) => row.status === SendResultStatus.SKIPPED_UNSUBSCRIBED,
        ).length,
        already_sent: ordered.filter((row) => row.status === SendResultStatus.ALREADY_SENT).length,
        game_count: games.games.length,
      },
    });
    return { status, sent: sent_now.length, failed: failed.length, results: ordered };
  }

  /**
   * Makes the quick link every email of this send carries. The token is held in memory only for
   * the duration of the send: it is never stored, logged or returned.
   * @param actor Who is acting.
   * @param draft The locked draft.
   * @returns The link and its token, or null when the draft does not include a quick link.
   */
  private async mint_quick_link(
    actor: IActingUser,
    draft: IStoredEmailDraft,
  ): Promise<{ link_id: string; token: string } | null> {
    if (!draft.include_quick_link) {
      return null;
    }
    const created = await this.options.quick_links.create_link(actor, {
      scope: build_quick_link_scope(draft.filters),
      expires_at: this.options.now() + draft.quick_link_expiry_days * EMAIL_DRAFT_LIMITS.MS_PER_DAY,
      email_draft_id: draft.draft_id,
    });
    return { link_id: created.link.link_id, token: created.token };
  }

  /**
   * Emails one recipient and records what happened. It never throws: any failure becomes a
   * FAILED result with a safe code, so one bad recipient cannot stop the rest.
   * @param context The send in progress.
   * @param contact The recipient as resolved when the send began.
   * @returns The recipient's result.
   */
  private async deliver_one(
    context: ISendContext,
    contact: IStoredContact,
  ): Promise<ISendResultRow> {
    const { actor, draft } = context;
    try {
      if (context.abort_code !== null) {
        return await this.record_failure(context, contact.contact_id, context.abort_code);
      }
      if (this.options.now() - context.started_at >= this.time_budget_ms) {
        return await this.record_failure(
          context,
          contact.contact_id,
          DeliveryErrorCode.TIME_BUDGET_EXCEEDED,
        );
      }
      // Consent is checked again now: the contact may have unsubscribed since the send began.
      const fresh = await this.options.contacts.get_contact(actor.tenant_id, contact.contact_id);
      if (!fresh) {
        return await this.record_failure(
          context,
          contact.contact_id,
          DeliveryErrorCode.CONTACT_MISSING,
        );
      }
      if (fresh.consent_status !== ConsentStatus.GRANTED) {
        return {
          contact_id: contact.contact_id,
          status: SendResultStatus.SKIPPED_UNSUBSCRIBED,
          error_code: null,
        };
      }
      const unsubscribe_token = await this.options.unsubscribe.issue_token(
        actor.tenant_id,
        fresh.contact_id,
      );
      const rendered = this.options.composer.render({
        content: draft,
        games: context.games,
        sender_name: context.from_name,
        postal_address: context.postal_address,
        recipient_greeting: make_recipient_greeting(fresh.display_name),
        quick_link_url: context.quick_link_url,
        unsubscribe_url: `${this.options.public_app_origin}/unsubscribe/${unsubscribe_token}`,
      });
      try {
        const receipt = await this.options.sender.send(context.credentials, {
          to_email: fresh.email_address,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
          from_name: context.from_name,
          reply_to: context.reply_to,
        });
        await this.record(context, contact.contact_id, DeliveryStatus.SENT, {
          provider_message_id: receipt.provider_message_id,
          error_code: null,
        });
        return { contact_id: contact.contact_id, status: SendResultStatus.SENT, error_code: null };
      } catch (error) {
        const error_code =
          error instanceof EmailDeliveryError ? error.error_code : DeliveryErrorCode.UNKNOWN;
        if (error_code === DeliveryErrorCode.PROVIDER_AUTH) {
          context.abort_code = error_code;
        }
        console.error('An email could not be delivered', {
          draft_id: draft.draft_id,
          contact_id: contact.contact_id,
          to: mask_contact_email(fresh.email_address),
          error_code,
        });
        return await this.record_failure(context, contact.contact_id, error_code);
      }
    } catch (error) {
      console.error('Sending to a recipient failed unexpectedly', {
        draft_id: draft.draft_id,
        contact_id: contact.contact_id,
        error_name: error instanceof Error ? error.name : 'unknown',
      });
      return {
        contact_id: contact.contact_id,
        status: SendResultStatus.FAILED,
        error_code: DeliveryErrorCode.UNKNOWN,
      };
    }
  }

  /**
   * Records a failed attempt and builds its result.
   * @param context The send in progress.
   * @param contact_id The recipient.
   * @param error_code The safe code.
   * @returns The FAILED result.
   */
  private async record_failure(
    context: ISendContext,
    contact_id: string,
    error_code: DeliveryErrorCode,
  ): Promise<ISendResultRow> {
    await this.record(context, contact_id, DeliveryStatus.FAILED, {
      provider_message_id: null,
      error_code,
    });
    return { contact_id, status: SendResultStatus.FAILED, error_code };
  }

  /**
   * Records one attempt in the delivery store. A failure to record is logged and swallowed,
   * because the email may already have been delivered and the send must go on.
   * @param context The send in progress.
   * @param contact_id The recipient.
   * @param status What happened.
   * @param detail The vendor's message id, or the failure code.
   * @returns Resolves once the attempt was recorded or the failure logged.
   */
  private async record(
    context: ISendContext,
    contact_id: string,
    status: DeliveryStatus,
    detail: { provider_message_id: string | null; error_code: DeliveryErrorCode | null },
  ): Promise<void> {
    const now = this.options.now();
    try {
      await this.options.deliveries.record_result({
        tenant_id: context.actor.tenant_id,
        draft_id: context.draft.draft_id,
        contact_id,
        status,
        provider_message_id: detail.provider_message_id,
        error_code: detail.error_code,
        sent_at: status === DeliveryStatus.SENT ? now : null,
        created_at: now,
        created_by: context.actor.user_id,
        updated_at: now,
        updated_by: context.actor.user_id,
      });
    } catch (error) {
      console.error('Could not record the result of an email', {
        draft_id: context.draft.draft_id,
        contact_id,
        error_name: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  /**
   * Revokes a quick link made for a send that was then abandoned, so no live link exists that no
   * email carries. A failure is logged and swallowed: the original error is what the caller needs.
   * @param actor Who is acting.
   * @param link_id The link made by the abandoned send, if one was.
   * @returns Resolves once done.
   */
  private async revoke_unused_link(actor: IActingUser, link_id: string | null): Promise<void> {
    if (link_id === null) {
      return;
    }
    try {
      await this.options.quick_links.revoke_link(actor, link_id);
    } catch (error) {
      console.error('Could not revoke the quick link of an abandoned send', link_id, error);
    }
  }

  /**
   * Puts a locked draft back after a send was abandoned before anything was delivered.
   * @param actor Who is acting.
   * @param draft_id The draft.
   * @param revert_to The status to restore.
   * @returns Resolves once done; a failure is logged and the stale-lock rule recovers the draft later.
   */
  private async revert(
    actor: IActingUser,
    draft_id: string,
    revert_to: DraftStatus,
  ): Promise<void> {
    try {
      await this.options.drafts.revert_send(
        actor.tenant_id,
        draft_id,
        revert_to === DraftStatus.PARTIALLY_SENT ? DraftStatus.PARTIALLY_SENT : DraftStatus.DRAFT,
        this.options.now(),
        actor.user_id,
      );
    } catch (error) {
      console.error('Could not unlock a draft after a failed send', draft_id, error);
    }
  }

  /**
   * Ends the send: records the outcome on the draft and writes the audit row (counts only, no
   * addresses). Failures here are logged, never thrown, because the emails have already gone.
   * @param actor Who is acting.
   * @param before The draft as it was before the send.
   * @param outcome How the send ended.
   * @returns Resolves when done.
   */
  private async finish(
    actor: IActingUser,
    before: IStoredEmailDraft,
    outcome: {
      status: DraftStatus.SENT | DraftStatus.PARTIALLY_SENT;
      recipient_count: number;
      quick_link_id: string | null;
      sent_at: number | null;
      counts: Record<string, number>;
    },
  ): Promise<void> {
    try {
      const finished = await this.options.drafts.finish_send(
        actor.tenant_id,
        before.draft_id,
        {
          status: outcome.status,
          recipient_count: outcome.recipient_count,
          quick_link_id: outcome.quick_link_id,
          sent_at: outcome.sent_at,
        },
        this.options.now(),
        actor.user_id,
      );
      if (!finished) {
        console.error('A send finished but the draft was no longer locked', before.draft_id);
      }
    } catch (error) {
      console.error('Could not record the end of a send', before.draft_id, error);
    }
    try {
      await this.options.audit.write_audit_log({
        user_id: actor.user_id,
        tenant_id: actor.tenant_id,
        resource_type: EMAIL_DRAFT_AUDIT_RESOURCE,
        resource_id: before.draft_id,
        action: AuditAction.UPDATE,
        before_state: { draft_id: before.draft_id, status: before.status },
        after_state: {
          draft_id: before.draft_id,
          status: outcome.status,
          quick_link_id: outcome.quick_link_id,
          ...outcome.counts,
        },
        actual_role: actor.actual_role,
        effective_role: actor.effective_role,
      });
    } catch (error) {
      console.error('Could not write the audit row of a send', before.draft_id, error);
    }
  }
}
