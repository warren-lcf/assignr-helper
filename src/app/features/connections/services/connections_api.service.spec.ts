import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConnectionTestFailure } from '../enums/connection_test_failure.enum';
import { IntegrationProvider } from '../enums/integration_provider.enum';
import { CONNECTED_CONNECTION, CONNECTION_FIXTURES } from '../mocks/connection_view.mock';
import { SYNC_RUN_FIXTURES } from '../mocks/sync_run_view.mock';
import { ConnectionsApiService } from './connections_api.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    api: TestBed.inject(ConnectionsApiService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('ConnectionsApiService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
  });

  it('lists connections, unwrapping the data envelope', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_connections().subscribe((connections) => (result = connections));
    const request = http.expectOne('/api/connections');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { connections: CONNECTION_FIXTURES } });

    expect(result).toEqual(CONNECTION_FIXTURES);
  });

  it('creates a connection with the credentials in the body only', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .create_connection({
        provider: IntegrationProvider.ASSIGNR,
        client_id: 'id-1',
        client_secret: 'secret-1',
      })
      .subscribe((connection) => (result = connection));
    const request = http.expectOne('/api/connections');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      provider: 'ASSIGNR',
      client_id: 'id-1',
      client_secret: 'secret-1',
    });
    expect(request.request.urlWithParams).not.toContain('secret');
    request.flush(
      { data: { connection: CONNECTED_CONNECTION } },
      { status: 201, statusText: 'Created' },
    );

    expect(result).toEqual(CONNECTED_CONNECTION);
  });

  it('replaces credentials with PUT, sending only what it is given', () => {
    const { api, http } = setup();
    let result: unknown;

    api
      .replace_credentials('conn 1', { client_secret: 'new-secret' })
      .subscribe((connection) => (result = connection));
    const request = http.expectOne('/api/connections/conn%201/credentials');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ client_secret: 'new-secret' });
    request.flush({ data: { connection: CONNECTED_CONNECTION } });

    expect(result).toEqual(CONNECTED_CONNECTION);
  });

  it('sends a new client id together with the secret', () => {
    const { api, http } = setup();

    api.replace_credentials('c1', { client_secret: 's', client_id: 'new-id' }).subscribe();

    const request = http.expectOne('/api/connections/c1/credentials');
    expect(request.request.body).toEqual({ client_secret: 's', client_id: 'new-id' });
    request.flush({ data: { connection: CONNECTED_CONNECTION } });
  });

  it('tests a connection', () => {
    const { api, http } = setup();
    let result: unknown;

    api.test_connection('c1').subscribe((test) => (result = test));
    const request = http.expectOne('/api/connections/c1/test');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { ok: false, failure: ConnectionTestFailure.REJECTED } });

    expect(result).toEqual({ ok: false, failure: 'REJECTED' });
  });

  it('disconnects a connection', () => {
    const { api, http } = setup();
    let result: unknown;

    api.disconnect_connection('c1').subscribe((connection) => (result = connection));
    const request = http.expectOne('/api/connections/c1/disconnect');
    expect(request.request.method).toBe('POST');
    request.flush({ data: { connection: CONNECTED_CONNECTION } });

    expect(result).toEqual(CONNECTED_CONNECTION);
  });

  it('syncs a connection, with or without refreshing reference data', () => {
    const { api, http } = setup();
    let result: unknown;

    api.sync_connection('c1').subscribe((runs) => (result = runs));
    const plain = http.expectOne('/api/connections/c1/sync');
    expect(plain.request.method).toBe('POST');
    expect(plain.request.body).toEqual({ refresh_reference_data: false });
    plain.flush({ data: { runs: SYNC_RUN_FIXTURES } });
    expect(result).toEqual(SYNC_RUN_FIXTURES);

    api.sync_connection('c1', true).subscribe();
    const refreshing = http.expectOne('/api/connections/c1/sync');
    expect(refreshing.request.body).toEqual({ refresh_reference_data: true });
    refreshing.flush({ data: { runs: [] } });
  });

  it('lists the 20 most recent sync runs by default', () => {
    const { api, http } = setup();
    let result: unknown;

    api.list_sync_runs('c1').subscribe((runs) => (result = runs));
    const request = http.expectOne('/api/connections/c1/sync-runs?limit=20');
    expect(request.request.method).toBe('GET');
    request.flush({ data: { runs: SYNC_RUN_FIXTURES } });

    expect(result).toEqual(SYNC_RUN_FIXTURES);
  });

  it('honours a different run limit', () => {
    const { api, http } = setup();

    api.list_sync_runs('c1', 5).subscribe();

    http.expectOne('/api/connections/c1/sync-runs?limit=5').flush({ data: { runs: [] } });
  });
});
