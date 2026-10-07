/** A user's active membership in one tenant. */
export interface IMembership {
  /** Null when the membership is in the platform tenant (a platform administrator). */
  tenant_id: string | null;
  role: string;
}
