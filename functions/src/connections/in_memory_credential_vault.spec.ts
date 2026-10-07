import { describe_credential_vault_contract } from './contracts/credential_vault.contract.js';
import { InMemoryCredentialVault } from './in_memory_credential_vault.js';

describe_credential_vault_contract('In-memory', () => new InMemoryCredentialVault());
