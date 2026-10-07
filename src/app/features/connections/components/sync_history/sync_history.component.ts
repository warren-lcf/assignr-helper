import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { CardHeaderComponent } from '@hch-shared-libraries/ui-kit/app';
import {
  EmptyStateComponent,
  StatusChipComponent,
  UserDatePipe,
} from '@hch-shared-libraries/ui-kit/core';
import {
  DataTableCellDirective,
  DataTableColumn,
  DataTableComponent,
  DataTableStackMode,
} from '@hch-shared-libraries/ui-kit/data';
import { of } from 'rxjs';
import { AppTranslationService } from '../../../../core/services/translation/app_translation.service';
import { SYNC_KIND_LABEL } from '../../constants/sync_kind_label.constant';
import { SYNC_RUN_STATUS_PRESENTATION } from '../../constants/sync_run_status_presentation.constant';
import { IConnectionView } from '../../models/connection_view.model';
import { ISyncRunView } from '../../models/sync_run_view.model';
import { ConnectionsApiService, SYNC_RUNS_LIMIT } from '../../services/connections_api.service';
import { format_count } from '../../utils/format_count';
import { format_duration } from '../../utils/format_duration';

/** Below this width of the table's own container the runs stack as cards. */
const STACK_BELOW_CONTAINER_PX = 720;

/**
 * The recent sync runs of one connection (the first by default, or the one
 * picked in the select): kind, status as icon and text, when it started, the
 * four record counts right-aligned with tabular figures, and how long it took.
 * Below a container width of 720px the table stacks into cards, so a phone
 * never scrolls sideways.
 */
@Component({
  selector: 'app-sync-history',
  standalone: true,
  imports: [
    DataTableCellDirective,
    DataTableComponent,
    CardHeaderComponent,
    EmptyStateComponent,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    StatusChipComponent,
    UserDatePipe,
  ],
  templateUrl: './sync_history.component.html',
  styleUrl: './sync_history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncHistoryComponent {
  private readonly api = inject(ConnectionsApiService);
  private readonly translation = inject(AppTranslationService);

  /** The tenant's connections; the history shows one of them. */
  public readonly connections = input.required<IConnectionView[]>();
  /** Bump to reload the runs, e.g. after "Sync now". */
  public readonly refresh_token = input(0);

  /** The connection shown: the first until the user picks another, and again if it disappears. */
  public readonly selected_connection_id = linkedSignal<IConnectionView[], string | null>({
    source: this.connections,
    computation: (connections, previous) =>
      connections.some((connection) => connection.connection_id === previous?.value)
        ? (previous?.value ?? null)
        : (connections[0]?.connection_id ?? null),
  });
  public readonly selected_connection = computed(
    () =>
      this.connections().find(
        (connection) => connection.connection_id === this.selected_connection_id(),
      ) ?? null,
  );
  public readonly selected_name = computed(
    () => this.selected_connection()?.account_label ?? this.t('Unnamed account'),
  );

  public readonly runs = rxResource({
    params: () => ({ id: this.selected_connection_id(), refresh: this.refresh_token() }),
    stream: ({ params }) =>
      params.id === null ? of([]) : this.api.list_sync_runs(params.id, SYNC_RUNS_LIMIT),
  });
  public readonly run_rows = computed<ISyncRunView[]>(() =>
    this.runs.hasValue() ? this.runs.value() : [],
  );
  public readonly load_failed = computed(
    () => !this.runs.hasValue() && this.runs.error() !== undefined,
  );

  public readonly stack_mode = DataTableStackMode.CONTAINER;
  public readonly stack_below_px = STACK_BELOW_CONTAINER_PX;

  public readonly columns = computed<DataTableColumn<ISyncRunView>[]>(() => [
    { key: 'kind', label: this.t('Kind'), cell: (run) => this.t(SYNC_KIND_LABEL[run.kind]) },
    {
      key: 'status',
      label: this.t('Status'),
      cell: (run) => this.t(SYNC_RUN_STATUS_PRESENTATION[run.status].label),
    },
    { key: 'started_at', label: this.t('Started'), cell: (run) => String(run.started_at) },
    {
      key: 'seen_count',
      label: this.t('Seen'),
      cell: (run) => format_count(run.seen_count),
      numeric: true,
    },
    {
      key: 'created_count',
      label: this.t('Created'),
      cell: (run) => format_count(run.created_count),
      numeric: true,
    },
    {
      key: 'updated_count',
      label: this.t('Updated'),
      cell: (run) => format_count(run.updated_count),
      numeric: true,
    },
    {
      key: 'removed_count',
      label: this.t('Removed'),
      cell: (run) => format_count(run.removed_count),
      numeric: true,
    },
    {
      key: 'duration_ms',
      label: this.t('Duration'),
      cell: (run) => format_duration(run.duration_ms),
      numeric: true,
    },
  ]);

  public constructor() {
    effect(() => {
      const error = this.runs.error();
      if (error) console.error('Could not load the sync history', error);
    });
  }

  /**
   * Translates an English key for the template.
   * @param key English text.
   * @param params Values for `{{placeholders}}`.
   * @returns The translated text.
   */
  public t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }

  /**
   * Narrows a table cell's row to a run (the cell template's context is untyped).
   * @param row The row the table hands the cell template.
   * @returns The same row as a run.
   */
  public as_run(row: unknown): ISyncRunView {
    return row as ISyncRunView;
  }

  /**
   * How to draw a run's status.
   * @param run The run.
   * @returns Label, icon and tone.
   */
  public status_of(run: ISyncRunView) {
    return SYNC_RUN_STATUS_PRESENTATION[run.status];
  }

  /**
   * Switches the history to another connection.
   * @param connection_id The connection to show.
   * @returns Nothing.
   */
  public select_connection(connection_id: string): void {
    this.selected_connection_id.set(connection_id);
  }

  /**
   * Loads the runs again after a failure.
   * @returns Nothing.
   */
  public retry(): void {
    this.runs.reload();
  }
}
