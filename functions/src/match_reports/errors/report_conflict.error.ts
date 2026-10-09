/** The report kept changing under every attempt to write it, so the edit was not saved. */
export class ReportConflictError extends Error {
  public constructor(public readonly report_id: string) {
    super(`Match report ${report_id} was changed by someone else`);
    this.name = 'ReportConflictError';
  }
}
