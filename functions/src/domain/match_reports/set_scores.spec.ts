import { describe, expect, it } from 'vitest';
import { IMatchReport } from './match_report.model.js';
import { MatchReportStatus } from './match_report_status.enum.js';
import { ReportEditErrorCode } from './report_edit_error_code.enum.js';
import { set_scores } from './set_scores.js';

function make_report(overrides: Partial<IMatchReport> = {}): IMatchReport {
  return {
    report_id: 'r1',
    game_id: 'g1',
    status: MatchReportStatus.DRAFT,
    home_score: null,
    away_score: null,
    notes: null,
    incidents: [],
    client_revision: 0,
    lock_version: 4,
    ...overrides,
  };
}

describe('set_scores', () => {
  it('sets both scores, bumps client_revision and does not mutate the input', () => {
    const report = make_report();

    const result = set_scores(report, 3, 1);

    expect(result.error_code).toBeNull();
    expect(result.report).toMatchObject({ home_score: 3, away_score: 1, client_revision: 1 });
    expect(result.report.lock_version).toBe(4);
    expect(report.home_score).toBeNull();
    expect(report.client_revision).toBe(0);
  });

  it('accepts boundary scores and null to clear', () => {
    expect(set_scores(make_report(), 0, 99).error_code).toBeNull();
    const cleared = set_scores(make_report({ home_score: 2, away_score: 2 }), null, null);
    expect(cleared.report).toMatchObject({ home_score: null, away_score: null });
    expect(set_scores(make_report(), 2, null).report).toMatchObject({
      home_score: 2,
      away_score: null,
    });
  });

  it.each([
    [-1, 0],
    [0, 100],
    [1.5, 0],
    [0, NaN],
  ])('rejects scores %s-%s', (home, away) => {
    const report = make_report();

    const result = set_scores(report, home, away);

    expect(result.error_code).toBe(ReportEditErrorCode.SCORE_INVALID);
    expect(result.report).toBe(report);
  });

  it.each([MatchReportStatus.READY, MatchReportStatus.SUBMITTED, MatchReportStatus.NOT_SUPPORTED])(
    'refuses when the report is %s',
    (status) => {
      const report = make_report({ status });

      const result = set_scores(report, 1, 0);

      expect(result.error_code).toBe(ReportEditErrorCode.REPORT_NOT_EDITABLE);
      expect(result.report).toBe(report);
    },
  );
});
