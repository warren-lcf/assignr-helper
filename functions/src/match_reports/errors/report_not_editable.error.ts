/** The report is no longer a DRAFT, so it cannot be changed. */
export class ReportNotEditableError extends Error {
  public constructor(public readonly report_id: string) {
    super(`Match report ${report_id} is not editable`);
    this.name = 'ReportNotEditableError';
  }
}
