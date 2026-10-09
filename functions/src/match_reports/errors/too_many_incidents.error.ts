/** The report already holds the most incidents it may. */
export class TooManyIncidentsError extends Error {
  public constructor(
    public readonly report_id: string,
    public readonly limit: number,
  ) {
    super(`Match report ${report_id} already has ${limit} incidents`);
    this.name = 'TooManyIncidentsError';
  }
}
