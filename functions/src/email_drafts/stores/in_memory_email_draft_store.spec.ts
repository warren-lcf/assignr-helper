import { describe_email_draft_store_contract } from './contracts/email_draft_store.contract.js';
import { InMemoryEmailDraftStore } from './in_memory_email_draft_store.js';

describe_email_draft_store_contract('InMemory', () => new InMemoryEmailDraftStore());
