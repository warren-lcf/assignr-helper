import { describe_secret_key_backend_contract } from './contracts/secret_key_backend.contract.js';
import { InMemorySecretKeyBackend } from './in_memory_secret_key_backend.js';

describe_secret_key_backend_contract('InMemory', () => new InMemorySecretKeyBackend());
