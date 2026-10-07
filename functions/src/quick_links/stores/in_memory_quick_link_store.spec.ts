import { describe_quick_link_store_contract } from './contracts/quick_link_store.contract.js';
import { InMemoryQuickLinkStore } from './in_memory_quick_link_store.js';

describe_quick_link_store_contract('InMemory', () => new InMemoryQuickLinkStore());
