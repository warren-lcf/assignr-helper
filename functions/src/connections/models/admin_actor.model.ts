/** Who is changing a connection, for stamps and the audit trail. */
export interface IAdminActor {
  /** Tenant being acted in. */
  tenant_id: string;
  /** The real person (not the identity viewed as). */
  user_id: string;
  actual_role: string;
  effective_role: string;
}
