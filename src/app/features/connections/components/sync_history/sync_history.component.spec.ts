import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import {
  CONNECTION_FIXTURES,
  CONNECTED_CONNECTION,
  NEEDS_ATTENTION_CONNECTION,
} from '../../mocks/connection_view.mock';
import {
  FAILED_RUN,
  RUNNING_RUN,
  SKIPPED_RUN,
  SUCCEEDED_RUN,
  SYNC_RUN_FIXTURES,
} from '../../mocks/sync_run_view.mock';
import { make_translation_service_double } from '../../mocks/translation_service.mock';
import { IConnectionView } from '../../models/connection_view.model';
import { ISyncRunView } from '../../models/sync_run_view.model';
import { ConnectionsApiService } from '../../services/connections_api.service';
import { SyncHistoryComponent } from './sync_history.component';

function render(
  list_sync_runs: (connection_id: string) => Observable<ISyncRunView[]>,
  connections: IConnectionView[] = [CONNECTED_CONNECTION],
) {
  const api = { list_sync_runs: vi.fn((connection_id: string) => list_sync_runs(connection_id)) };
  TestBed.configureTestingModule({
    imports: [SyncHistoryComponent],
    providers: [
      { provide: ConnectionsApiService, useValue: api },
      { provide: AppTranslationService, useValue: make_translation_service_double() },
    ],
  });
  const fixture = TestBed.createComponent(SyncHistoryComponent);
  fixture.componentRef.setInput('connections', connections);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    fixture.detectChanges();
  };
  return { fixture, element, api, settle };
}

describe('SyncHistoryComponent', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logged.mockRestore();
  });

  it('loads the 20 most recent runs of the first connection and names it', async () => {
    const { api, element, settle } = render(
      () => of([...SYNC_RUN_FIXTURES]),
      [...CONNECTION_FIXTURES],
    );
    await settle();

    expect(api.list_sync_runs).toHaveBeenCalledWith('conn-1', 20);
    expect(element.textContent).toContain('Sync history');
    expect(element.textContent).toContain('Metro Youth Soccer Assignor');
  });

  it('shows a loading state while the runs load', async () => {
    const pending = new Subject<ISyncRunView[]>();
    const { element, fixture } = render(() => pending);
    fixture.detectChanges();

    expect(element.querySelector('hch-data-table')).not.toBeNull();
    expect(element.textContent).not.toContain('No sync runs yet');
    expect(element.querySelector('hch-skeleton-line, hch-skeleton-card')).not.toBeNull();
  });

  it('lists each run with kind, status text and icon, counts and duration', async () => {
    const { element, settle } = render(() =>
      of([SUCCEEDED_RUN, FAILED_RUN, SKIPPED_RUN, RUNNING_RUN]),
    );
    await settle();

    const text = element.textContent ?? '';
    expect(text).toContain('Open games');
    expect(text).toContain('My games');
    expect(text).toContain('Reference data');
    for (const label of ['Succeeded', 'Failed', 'Skipped', 'Running']) {
      expect(text).toContain(label);
    }
    const chips = Array.from(element.querySelectorAll('hch-status-chip'));
    expect(chips.map((chip) => chip.querySelector('mat-icon')?.textContent?.trim())).toEqual(
      expect.arrayContaining(['check_circle', 'error', 'skip_next', 'sync']),
    );
    expect(text).toContain(new Intl.NumberFormat().format(1234));
    expect(text).toContain('1.2');
  });

  it('shows the started time through the user date pipe', async () => {
    const { element, settle } = render(() => of([SUCCEEDED_RUN]));
    await settle();

    const started = Array.from(element.querySelectorAll('td, .data_table_cell_value')).find(
      (node) => /20\d\d/.test(node.textContent ?? ''),
    );
    expect(started).toBeDefined();
  });

  it('marks the count and duration columns as numeric so they align to the end', async () => {
    const { element, settle } = render(() => of([SUCCEEDED_RUN]));
    await settle();

    const numeric_headers = element.querySelectorAll(
      'th.data_table_numeric, th.mat-column-seen_count',
    );
    expect(numeric_headers.length).toBeGreaterThan(0);
  });

  it('says there are no runs yet when the list is empty', async () => {
    const { element, settle } = render(() => of([]));
    await settle();

    expect(element.textContent).toContain('No sync runs yet');
  });

  it('shows an error with a retry and logs the real error when loading fails', async () => {
    let attempts = 0;
    const { element, fixture, settle } = render(() => {
      attempts += 1;
      return attempts === 1
        ? throwError(() => new HttpErrorResponse({ status: 500 }))
        : of([SUCCEEDED_RUN]);
    });
    await settle();

    expect(element.textContent).toContain('Sync history could not be loaded');
    expect(logged).toHaveBeenCalledWith('Could not load the sync history', expect.anything());

    (element.querySelector('[data-testid="sync-history-retry"]') as HTMLElement).click();
    fixture.detectChanges();
    await settle();

    expect(element.textContent).not.toContain('could not be loaded');
    expect(element.textContent).toContain('Open games');
  });

  it('offers a connection picker only when there is more than one connection', async () => {
    const single = render(() => of([]));
    await single.settle();
    expect(
      single.element.querySelector('[data-testid="sync-history-connection-select"]'),
    ).toBeNull();
    TestBed.resetTestingModule();

    const several = render(() => of([]), [CONNECTED_CONNECTION, NEEDS_ATTENTION_CONNECTION]);
    await several.settle();
    expect(
      several.element.querySelector('[data-testid="sync-history-connection-select"]'),
    ).not.toBeNull();
  });

  it('shows the picked connection and loads its runs', async () => {
    const { api, element, fixture, settle } = render(
      () => of([]),
      [CONNECTED_CONNECTION, NEEDS_ATTENTION_CONNECTION],
    );
    await settle();

    fixture.componentInstance.select_connection('conn-2');
    fixture.detectChanges();
    await settle();

    expect(api.list_sync_runs).toHaveBeenLastCalledWith('conn-2', 20);
    expect(element.textContent).toContain('County Rec League');
  });

  it('falls back to the first connection when the picked one disappears', async () => {
    const { fixture, settle } = render(
      () => of([]),
      [CONNECTED_CONNECTION, NEEDS_ATTENTION_CONNECTION],
    );
    await settle();
    fixture.componentInstance.select_connection('conn-2');

    fixture.componentRef.setInput('connections', [CONNECTED_CONNECTION]);
    fixture.detectChanges();

    expect(fixture.componentInstance.selected_connection_id()).toBe('conn-1');
  });

  it('reloads the runs when the refresh token changes', async () => {
    const { api, fixture, settle } = render(() => of([]));
    await settle();
    expect(api.list_sync_runs).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('refresh_token', 1);
    fixture.detectChanges();
    await settle();

    expect(api.list_sync_runs).toHaveBeenCalledTimes(2);
  });
});
