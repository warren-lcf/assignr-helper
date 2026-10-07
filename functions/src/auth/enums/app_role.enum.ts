/** The system roles. Slugs match core-server's role slug pattern (`^[A-Z][A-Z0-9_]{1,39}$`). */
export enum AppRole {
  /** Operates the platform; may view as another tenant or role. */
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  /** Owns a tenant (a referee, or an association) and everything in it. */
  TENANT_OWNER = 'TENANT_OWNER',
  /** A person invited into a tenant with narrower access. */
  TENANT_MEMBER = 'TENANT_MEMBER',
}
