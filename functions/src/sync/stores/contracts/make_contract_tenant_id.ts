import { randomUUID } from 'node:crypto';

/**
 * Creates a fresh tenant id so a contract test never sees rows left by another test or
 * run in a shared database. Contract tests only ever write rows under such ids.
 * @returns A unique tenant id that fits the 64 character `tenant_id` columns.
 */
export function make_contract_tenant_id(): string {
  return `contract-${randomUUID()}`;
}
