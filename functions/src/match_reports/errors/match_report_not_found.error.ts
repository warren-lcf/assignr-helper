/** No match report with that id exists for the tenant. */
export class MatchReportNotFoundError extends Error {
  public constructor(public readonly report_id: string) {
    super(`Match report ${report_id} was not found`);
    this.name = 'MatchReportNotFoundError';
  }
}
