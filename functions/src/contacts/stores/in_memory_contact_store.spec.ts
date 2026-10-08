import { describe_contact_store_contract } from './contracts/contact_store.contract.js';
import { InMemoryContactStore } from './in_memory_contact_store.js';

describe_contact_store_contract('InMemory', () => new InMemoryContactStore());
