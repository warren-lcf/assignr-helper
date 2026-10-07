/** Audit columns carried by every stored row (UTC milliseconds; actor is a user id or system id). */
export interface IAuditStamp {
  created_at: number;
  created_by: string;
  updated_at: number;
  updated_by: string;
}
