import { AuditAction, type AuditLogService } from '@hch-shared-libraries/core-server/audit';
import { mask_contact_email } from '../domain/email/mask_contact_email.js';
import { IActingUser } from '../http/models/acting_user.model.js';
import { EmailApiKeyRequiredError } from './errors/email_api_key_required.error.js';
import { IEmailSettingsInput } from './models/email_settings_input.model.js';
import { IStoredEmailSettings } from './models/stored_email_settings.model.js';
import { IEmailSettingsVault } from './ports/email_settings_vault.interface.js';
import { IEmailSettingsView } from './views/email_settings_view.model.js';
import { to_email_settings_view } from './views/to_email_settings_view.js';

/** Audit resource type for a tenant's email settings; the resource id is the tenant id. */
export const EMAIL_SETTINGS_AUDIT_RESOURCE = 'email_settings';

/** Dependencies of the email settings service. */
export interface IEmailSettingsServiceOptions {
  vault: IEmailSettingsVault;
  audit: AuditLogService;
}

/**
 * Lets a tenant owner connect their own SendGrid account: save the API key and sender details,
 * see them (without the key), and remove them. The key goes only to the secret vault. Every
 * change writes an audit row with a masked sender address and a flag for whether the key
 * changed, never the key itself.
 */
export class EmailSettingsService {
  /**
   * Creates the service.
   * @param options Vault and audit log.
   */
  public constructor(private readonly options: IEmailSettingsServiceOptions) {}

  /**
   * Reads a tenant's settings.
   * @param tenant_id Owning tenant.
   * @returns The settings without the API key.
   */
  public async get_view(tenant_id: string): Promise<IEmailSettingsView> {
    return to_email_settings_view(await this.options.vault.read(tenant_id));
  }

  /**
   * Reads a tenant's full settings, API key included, for sending. Never return the result to a client.
   * @param tenant_id Owning tenant.
   * @returns The settings, or null when email is not configured.
   */
  public async get_for_sending(tenant_id: string): Promise<IStoredEmailSettings | null> {
    return this.options.vault.read(tenant_id);
  }

  /**
   * Saves a tenant's settings. The non-secret fields are replaced as a whole; the API key is
   * replaced only when one is given.
   * @param actor Who is acting.
   * @param input Validated settings.
   * @returns The settings as saved, without the API key.
   * @throws EmailApiKeyRequiredError when email is not configured yet and no API key is given.
   */
  public async save(actor: IActingUser, input: IEmailSettingsInput): Promise<IEmailSettingsView> {
    const existing = await this.options.vault.read(actor.tenant_id);
    const api_key = input.api_key ?? existing?.api_key ?? null;
    if (api_key === null) {
      throw new EmailApiKeyRequiredError();
    }
    const saved: IStoredEmailSettings = {
      api_key,
      from_email: input.from_email,
      from_name: input.from_name,
      reply_to: input.reply_to,
      postal_address: input.postal_address,
    };
    await this.options.vault.write(actor.tenant_id, saved);
    await this.audit(
      actor,
      existing ? AuditAction.UPDATE : AuditAction.CREATE,
      existing,
      saved,
      input.api_key !== null && input.api_key !== existing?.api_key,
    );
    return to_email_settings_view(saved);
  }

  /**
   * Removes a tenant's settings and API key. Removing nothing succeeds and writes no audit row.
   * @param actor Who is acting.
   * @returns The now unconfigured settings.
   */
  public async remove(actor: IActingUser): Promise<IEmailSettingsView> {
    const existing = await this.options.vault.read(actor.tenant_id);
    await this.options.vault.delete(actor.tenant_id);
    if (existing) {
      await this.audit(actor, AuditAction.DELETE, existing, null, false);
    }
    return to_email_settings_view(null);
  }

  /** Audit state is a deliberate allow-list: a masked sender and flags, never the API key or the full addresses. */
  private audit_state(settings: IStoredEmailSettings, key_changed: boolean): object {
    return {
      configured: true,
      from_email_masked: mask_contact_email(settings.from_email),
      from_name: settings.from_name,
      reply_to_masked: settings.reply_to === null ? null : mask_contact_email(settings.reply_to),
      has_postal_address: settings.postal_address !== null,
      provider_key_changed: key_changed,
    };
  }

  private async audit(
    actor: IActingUser,
    action: AuditAction,
    before: IStoredEmailSettings | null,
    after: IStoredEmailSettings | null,
    key_changed: boolean,
  ): Promise<void> {
    await this.options.audit.write_audit_log({
      user_id: actor.user_id,
      tenant_id: actor.tenant_id,
      resource_type: EMAIL_SETTINGS_AUDIT_RESOURCE,
      resource_id: actor.tenant_id,
      action,
      before_state: before ? this.audit_state(before, false) : null,
      after_state: after ? this.audit_state(after, key_changed) : null,
      actual_role: actor.actual_role,
      effective_role: actor.effective_role,
    });
  }
}
