/** What kind of tenant a row represents. */
export enum TenantType {
  /** A single referee (or small crew) and the assignors they work for. */
  REFEREE = 'REFEREE',
  /** An association of referees. Reserved; built after referee tenants. */
  ASSOCIATION = 'ASSOCIATION',
  /** The platform operator's own tenant, which holds platform administrators. */
  PLATFORM = 'PLATFORM',
}
