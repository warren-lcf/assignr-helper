/** The signed-in user's context as `GET /api/me` reports it (effective and real). */
export interface ISessionContext {
  /** Firebase user id. */
  uid: string;
  /** Account email, when the provider supplies one. */
  email: string | null;
  /** Tenant the request acts in (after any tenant switch). */
  tenant_id: string | null;
  /** Role the request acts as (after any role switch). */
  role: string;
  /** The user's own tenant. */
  actual_tenant_id: string | null;
  /** The user's own role. */
  actual_role: string;
  /** Permission keys granted to the effective role. */
  permissions: string[];
}
