import { IAuditStamp } from './audit_stamp.model.js';

/** A venue as stored in our independent copy. */
export interface IStoredVenue extends IAuditStamp {
  tenant_id: string;
  venue_id: string;
  connection_id: string;
  external_id: string;
  name: string;
  address_line: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  time_zone: string | null;
  /** User-editable label used to group venues; a sync never overwrites it. */
  location_group: string | null;
}
