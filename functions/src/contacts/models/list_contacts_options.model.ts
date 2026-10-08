import { ConsentStatus } from '../enums/consent_status.enum.js';

/** How to list a tenant's contacts. */
export interface IListContactsOptions {
  /** Only contacts with this consent; null lists them all. */
  consent_status: ConsentStatus | null;
  /** Most contacts to return. */
  limit: number;
}
