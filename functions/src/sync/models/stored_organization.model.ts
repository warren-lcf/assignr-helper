import { IAuditStamp } from './audit_stamp.model.js';

/** An assignor organization as stored in our independent copy. */
export interface IStoredOrganization extends IAuditStamp {
  tenant_id: string;
  organization_id: string;
  connection_id: string;
  external_id: string;
  name: string;
  flags: Record<string, boolean>;
  /** User-controlled switch; a sync never overwrites it. */
  sync_enabled: boolean;
}
