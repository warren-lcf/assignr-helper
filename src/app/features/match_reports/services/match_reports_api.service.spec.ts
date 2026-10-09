import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { IncidentType } from '../enums/incident_type.enum';
import { ReportStatus } from '../enums/report_status.enum';
import { TeamSide } from '../enums/team_side.enum';
import { make_report, make_summary } from '../mocks/match_report.mock';
import { MatchReportsApiService } from './match_reports_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(MatchReportsApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

const REPORT = make_report({ home_score: 2 });

describe('MatchReportsApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('starts a game’s report with a POST of its id, unwrapping the envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.open_report('game-1').subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ game_id: 'game-1' });
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('lists the summaries without any parameter by default', () => {
    const { api, http } = setup();
    const summaries = [make_summary()];
    let result: unknown;

    api.list_reports().subscribe((reports) => (result = reports));
    const request = http.expectOne('/api/match_reports');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ data: { reports: summaries } });

    expect(result).toEqual(summaries);
  });

  it('sends only the filters that are set', () => {
    const { api, http } = setup();

    api.list_reports({ status: ReportStatus.READY, game_id: 'game-9' }).subscribe();
    const request = http.expectOne((candidate) => candidate.url === '/api/match_reports');
    expect(request.request.params.get('status')).toBe('READY');
    expect(request.request.params.get('game_id')).toBe('game-9');
    request.flush({ data: { reports: [] } });

    api.list_reports({ status: ReportStatus.DRAFT }).subscribe();
    const second = http.expectOne((candidate) => candidate.url === '/api/match_reports');
    expect(second.request.params.keys()).toEqual(['status']);
    second.flush({ data: { reports: [] } });
  });

  it('reads one report, encoding its id in the path', () => {
    const { api, http } = setup();
    let result: unknown;

    api.get_report('a/b').subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/a%2Fb');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('sets the scores with a PUT of the scores, notes and revision', () => {
    const { api, http } = setup();
    const body = { home_score: 2, away_score: 1, notes: null, client_revision: 4 };
    let result: unknown;

    api.set_scores('report-1', body).subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/report-1/scores');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual(body);
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('adds a card with a POST of the card', () => {
    const { api, http } = setup();
    const body = {
      idempotency_key: 'key-0000000001',
      team_side: TeamSide.HOME,
      incident_type: IncidentType.YELLOW,
      jersey_number: 7,
      minute: 34,
      reason_code: null,
      notes: null,
    };
    let result: unknown;

    api.add_incident('report-1', body).subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/report-1/incidents');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(body);
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('removes a card with a DELETE, encoding both ids', () => {
    const { api, http } = setup();
    let result: unknown;

    api.remove_incident('report/1', 'inc 1').subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/report%2F1/incidents/inc%201');
    expect(request.request.method).toBe('DELETE');
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('marks ready with a POST', () => {
    const { api, http } = setup();
    let result: unknown;

    api.mark_ready('report-1').subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/report-1/ready');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('reopens with a POST', () => {
    const { api, http } = setup();
    let result: unknown;

    api.reopen('report-1').subscribe((report) => (result = report));
    const request = http.expectOne('/api/match_reports/report-1/reopen');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { report: REPORT } });

    expect(result).toEqual(REPORT);
  });

  it('lets an error answer reach the caller', () => {
    const { api, http } = setup();
    let status = 0;

    api
      .mark_ready('report-1')
      .subscribe({ error: (error: { status: number }) => (status = error.status) });
    http
      .expectOne('/api/match_reports/report-1/ready')
      .flush(
        { code: 'REPORT_NOT_READY', message: 'x', violations: [] },
        { status: 422, statusText: 'Unprocessable' },
      );

    expect(status).toBe(422);
  });
});
