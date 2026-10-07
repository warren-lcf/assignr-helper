/**
 * Who a request acts as. Satisfies core-server's `RoleSwitchableContext` and
 * `TenantSwitchableContext`, so its role switcher and tenant impersonator apply
 * to it directly.
 */
export interface IAuthContext {
  uid: string;
  email: string | null;
  /** Active tenant; null for platform-level administrators with no tenant view. */
  tenant_id: string | null;
  /** Role slug, e.g. `TENANT_OWNER`. */
  role: string;
}
