import { describe_email_delivery_store_contract } from './contracts/email_delivery_store.contract.js';
import { InMemoryEmailDeliveryStore } from './in_memory_email_delivery_store.js';

describe_email_delivery_store_contract('InMemory', () => new InMemoryEmailDeliveryStore());
