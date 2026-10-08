import { describe_email_settings_vault_contract } from './contracts/email_settings_vault.contract.js';
import { InMemoryEmailSettingsVault } from './in_memory_email_settings_vault.js';

describe_email_settings_vault_contract('InMemory', () => new InMemoryEmailSettingsVault());
