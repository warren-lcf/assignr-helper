import { IStoredEmailSettings } from '../models/stored_email_settings.model.js';

/** Port to the secret store holding each tenant's email sending settings and API key. */
export interface IEmailSettingsVault {
  /**
   * Reads a tenant's settings.
   * @param tenant_id Owning tenant.
   * @returns The settings, or null when none are stored.
   * @throws Error without the stored text when what is stored cannot be read.
   */
  read(tenant_id: string): Promise<IStoredEmailSettings | null>;

  /**
   * Stores (or replaces) a tenant's settings.
   * @param tenant_id Owning tenant.
   * @param settings The new settings.
   * @returns Resolves when stored.
   */
  write(tenant_id: string, settings: IStoredEmailSettings): Promise<void>;

  /**
   * Removes a tenant's settings, API key included.
   * @param tenant_id Owning tenant.
   * @returns Resolves when removed; removing nothing is not an error.
   */
  delete(tenant_id: string): Promise<void>;
}
