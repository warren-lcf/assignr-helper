import { describe_membership_resolver_contract } from './contracts/membership_resolver.contract.js';
import { InMemoryMembershipResolver } from './in_memory_membership_resolver.js';

describe_membership_resolver_contract(
  'In-memory',
  async (records) => new InMemoryMembershipResolver(records),
);
