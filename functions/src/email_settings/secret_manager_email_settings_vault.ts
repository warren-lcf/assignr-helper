import type { SecretManagerClient } from '@hch-shared-libraries/core-server';
import { IStoredEmailSettings } from './models/stored_email_settings.model.js';
import { IEmailSettingsVault } from './ports/email_settings_vault.interface.js';

/** Provider key of the tenant secret, giving the secret name `tenant-<tenant_id>-sendgrid`. */
export const EMAIL_SETTINGS_SECRET_PROVIDER = 'sendgrid';

/**
 * Reads a nullable string field of the stored JSON.
 * @param value Raw field.
 * @returns The text, or null when absent.
 * @throws Error when the field is present but not text.
 */
function nullable_text(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('unreadable');
  }
  return value;
}

/**
 * Settings vault over Google Secret Manager through core-server's client. A tenant's settings
 * are one tenant secret holding JSON, named by core-server's convention
 * `tenant-<tenant_id>-sendgrid`. The API key and the non-secret fields travel together so they
 * can never disagree. Nothing is ever written to the database.
 */
export class SecretManagerEmailSettingsVault implements IEmailSettingsVault {
  /**
   * Creates the vault.
   * @param secrets Secret Manager client scoped to the app's secret project.
   */
  public constructor(private readonly secrets: SecretManagerClient) {}

  /** @inheritdoc */
  public async read(tenant_id: string): Promise<IStoredEmailSettings | null> {
    const raw = await this.secrets.get_tenant_secret(tenant_id, EMAIL_SETTINGS_SECRET_PROVIDER);
    if (raw === null) return null;
    try {
      const candidate = JSON.parse(raw) as Record<string, unknown> | null;
      if (
        !candidate ||
        typeof candidate['api_key'] !== 'string' ||
        typeof candidate['from_email'] !== 'string'
      ) {
        throw new Error('unreadable');
      }
      return {
        api_key: candidate['api_key'],
        from_email: candidate['from_email'],
        from_name: nullable_text(candidate['from_name']),
        reply_to: nullable_text(candidate['reply_to']),
        postal_address: nullable_text(candidate['postal_address']),
      };
    } catch {
      // Say which tenant, never what was stored: the text holds the API key.
      throw new Error(`The stored email settings for tenant ${tenant_id} are unreadable`);
    }
  }

  /** @inheritdoc */
  public async write(tenant_id: string, settings: IStoredEmailSettings): Promise<void> {
    await this.secrets.put_tenant_secret(
      tenant_id,
      EMAIL_SETTINGS_SECRET_PROVIDER,
      JSON.stringify({
        api_key: settings.api_key,
        from_email: settings.from_email,
        from_name: settings.from_name,
        reply_to: settings.reply_to,
        postal_address: settings.postal_address,
      }),
    );
  }

  /** @inheritdoc */
  public async delete(tenant_id: string): Promise<void> {
    await this.secrets.delete_tenant_secret(tenant_id, EMAIL_SETTINGS_SECRET_PROVIDER);
  }
}
