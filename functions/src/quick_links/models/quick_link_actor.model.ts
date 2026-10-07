/** Who is changing a quick link, for stamps and the audit trail. */
export interface IQuickLinkActor {
  /** Tenant being acted in. */
  tenant_id: string;
  /** The real person (not the identity viewed as). */
  user_id: string;
  actual_role: string;
  effective_role: string;
}
