import { IStoredEmailSettings } from './models/stored_email_settings.model.js';
import { IEmailSettingsVault } from './ports/email_settings_vault.interface.js';

/** In-memory settings vault: the reference behaviour, and the double for specs. */
export class InMemoryEmailSettingsVault implements IEmailSettingsVault {
  private readonly entries = new Map<string, IStoredEmailSettings>();

  /** @inheritdoc */
  public async read(tenant_id: string): Promise<IStoredEmailSettings | null> {
    const found = this.entries.get(tenant_id);
    return found ? { ...found } : null;
  }

  /** @inheritdoc */
  public async write(tenant_id: string, settings: IStoredEmailSettings): Promise<void> {
    this.entries.set(tenant_id, { ...settings });
  }

  /** @inheritdoc */
  public async delete(tenant_id: string): Promise<void> {
    this.entries.delete(tenant_id);
  }
}
