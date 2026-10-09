import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { MatchReportErrorCode } from '../enums/match_report_error_code.enum';
import { FlushFailure } from '../enums/flush_failure.enum';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { ReportStatus } from '../enums/report_status.enum';
import { SaveState } from '../enums/save_state.enum';
import { IAddIncidentRequest } from '../models/add_incident_request.model';
import { IDroppedOperation } from '../models/dropped_operation.model';
import { IIncidentView } from '../models/incident_view.model';
import { IMatchReportView } from '../models/match_report_view.model';
import { QueuedOperation } from '../models/queued_operation.model';
import { apply_queue } from '../utils/apply_operation';
import { backoff_delay } from '../utils/backoff_delay';
import { classify_flush_failure } from '../utils/classify_flush_failure';
import { classify_report_error } from '../utils/classify_report_error';
import { generate_idempotency_key } from '../utils/generate_idempotency_key';
import { read_queue_record, write_queue_record } from '../utils/report_queue_storage';
import { MatchReportsApiService } from './match_reports_api.service';

/**
 * Keeps one open match report safe on a field with a poor signal. Every edit is applied to what the
 * screen shows at once, put on a queue kept in browser storage, and sent to the API one at a time, in
 * order. An edit leaves the queue only when the server accepted it (any 2xx; a replayed card answering
 * 200 counts). No connection, a server error, a timeout or "slow down" keeps the edit and tries again
 * with a doubling wait (one second up to thirty); any other refusal drops the edit with a message,
 * because retrying it would be refused again. The queue is flushed when the report opens, after every
 * edit and when the browser comes back online.
 *
 * What the screen shows is always derived: the last report the server confirmed with every waiting
 * edit applied on top. So once the queue is empty the screen is, by construction, the server's report.
 *
 * Provide it on the screen that edits a report (it is not a root service): each open report gets its
 * own queue, listeners and timers, all released with the screen. Only report data is ever stored; no
 * tokens. With browser storage blocked it still works, just without surviving a reload.
 */
@Injectable()
export class MatchReportSyncService {
  private readonly api = inject(MatchReportsApiService);
  private readonly destroy_ref = inject(DestroyRef);

  private readonly server_report = signal<IMatchReportView | null>(null);
  private readonly queue = signal<QueuedOperation[]>([]);
  private readonly is_flushing = signal(false);
  private readonly is_retry_scheduled = signal(false);
  private readonly is_online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  private readonly dropped_subject = new Subject<IDroppedOperation>();

  private revision = 0;
  private last_seq = 0;
  private failed_attempts = 0;
  private in_flight_seq: number | null = null;
  private retry_timer: ReturnType<typeof setTimeout> | undefined;
  private needs_resync = false;
  private is_destroyed = false;

  /** The report as the screen shows it: the server's, with every waiting edit applied. Null until started. */
  public readonly report = computed<IMatchReportView | null>(() => {
    const confirmed = this.server_report();
    return confirmed === null ? null : apply_queue(confirmed, this.queue());
  });
  /** How many edits are waiting to be accepted by the server. Scores edited in a row count once. */
  public readonly pending_count = computed(() => this.queue().length);
  /** Whether the report can be edited: only a draft can. */
  public readonly is_editable = computed(() => this.report()?.status === ReportStatus.DRAFT);
  /** What the save indicator tells the referee. */
  public readonly save_state = computed<SaveState>(() => {
    if (this.queue().length === 0) return SaveState.SAVED;
    if (!this.is_online()) return SaveState.OFFLINE;
    if (this.is_retry_scheduled()) return SaveState.RETRYING;
    return SaveState.SAVING;
  });
  /** Emits each edit the server refused for good, so the screen can say so. */
  public readonly dropped_operations: Observable<IDroppedOperation> =
    this.dropped_subject.asObservable();

  /** Named so the very same references can be removed again. */
  private readonly on_online = (): void => {
    this.is_online.set(true);
    this.failed_attempts = 0;
    void this.flush();
  };
  private readonly on_offline = (): void => {
    this.is_online.set(false);
  };

  public constructor() {
    window.addEventListener('online', this.on_online);
    window.addEventListener('offline', this.on_offline);
    this.destroy_ref.onDestroy(() => {
      this.is_destroyed = true;
      window.removeEventListener('online', this.on_online);
      window.removeEventListener('offline', this.on_offline);
      this.clear_retry_timer();
      this.dropped_subject.complete();
    });
  }

  /**
   * Starts working on a report just loaded from the server: picks up any edits left waiting by an earlier
   * visit and sends them.
   * @param report The report as the server has it.
   * @returns Resolves when the first flush has finished.
   */
  public start(report: IMatchReportView): Promise<void> {
    const stored = read_queue_record(report.report_id);
    this.revision = Math.max(report.client_revision, stored?.revision ?? 0);
    this.last_seq = stored?.last_seq ?? 0;
    this.queue.set(stored?.queue ?? []);
    this.server_report.set(report);
    return this.flush();
  }

  /**
   * Sets the final score. Applied at once; consecutive score edits that have not been sent yet become one.
   * @param home_score The home team's goals, 0 to 99.
   * @param away_score The away team's goals, 0 to 99.
   * @returns Resolves when the queue has been flushed as far as it can be.
   */
  public set_scores(home_score: number | null, away_score: number | null): Promise<void> {
    const current = this.report();
    if (current === null || !this.is_editable()) return Promise.resolve();
    const operation: QueuedOperation = {
      kind: ReportOperationKind.SET_SCORES,
      seq: ++this.last_seq,
      home_score,
      away_score,
      client_revision: ++this.revision,
    };
    const waiting = this.queue();
    const last = waiting[waiting.length - 1];
    const can_replace =
      last !== undefined &&
      last.kind === ReportOperationKind.SET_SCORES &&
      last.seq !== this.in_flight_seq;
    return this.enqueue(
      can_replace ? [...waiting.slice(0, -1), operation] : [...waiting, operation],
    );
  }

  /**
   * Adds a card. Applied at once. The server gives every card its own id, so the card is only ever
   * sent once under its idempotency key.
   * @param request The card, with its idempotency key.
   * @returns Resolves when the queue has been flushed as far as it can be.
   */
  public add_incident(request: IAddIncidentRequest): Promise<void> {
    if (this.report() === null || !this.is_editable()) return Promise.resolve();
    if (this.report()?.incidents.some((item) => item.idempotency_key === request.idempotency_key)) {
      return Promise.resolve();
    }
    return this.enqueue([
      ...this.queue(),
      { ...request, kind: ReportOperationKind.ADD_INCIDENT, seq: ++this.last_seq },
    ]);
  }

  /**
   * Puts back a card the referee just removed (Undo). If the removal is still waiting to be sent, the card
   * never left the server, so the removal is simply cancelled. Otherwise the card is added again as a new
   * card under a NEW idempotency key: the old key belongs to a card the server has already deleted.
   * @param incident The card that was removed.
   * @returns Resolves when the queue has been flushed as far as it can be.
   */
  public restore_incident(incident: IIncidentView): Promise<void> {
    if (this.report() === null || !this.is_editable()) return Promise.resolve();
    const waiting = this.queue();
    const unsent_removal = waiting.find(
      (item) =>
        item.kind === ReportOperationKind.REMOVE_INCIDENT &&
        item.idempotency_key === incident.idempotency_key &&
        item.seq !== this.in_flight_seq,
    );
    if (unsent_removal) {
      return this.enqueue(waiting.filter((item) => item.seq !== unsent_removal.seq));
    }
    return this.add_incident({
      idempotency_key: generate_idempotency_key(),
      team_side: incident.team_side,
      incident_type: incident.incident_type,
      jersey_number: incident.jersey_number,
      minute: incident.minute,
      reason_code: incident.reason_code,
      notes: incident.notes,
    });
  }

  /**
   * Removes a card. Applied at once. A card whose addition the server has not acknowledged has no server
   * id yet, so nothing is sent for it: if its addition is still waiting, both are cancelled here. If the
   * addition is in flight right now it cannot be called back, so the removal waits behind it and is sent
   * only once the answer has brought the card's server id.
   * @param idempotency_key The key of the card to remove.
   * @returns Resolves when the queue has been flushed as far as it can be.
   */
  public remove_incident(idempotency_key: string): Promise<void> {
    if (this.report() === null || !this.is_editable()) return Promise.resolve();
    const waiting = this.queue();
    const cancelable = waiting.find(
      (item) =>
        item.kind === ReportOperationKind.ADD_INCIDENT &&
        item.idempotency_key === idempotency_key &&
        item.seq !== this.in_flight_seq,
    );
    if (cancelable) return this.enqueue(waiting.filter((item) => item.seq !== cancelable.seq));
    if (!this.report()?.incidents.some((item) => item.idempotency_key === idempotency_key)) {
      return Promise.resolve();
    }
    return this.enqueue([
      ...waiting,
      { kind: ReportOperationKind.REMOVE_INCIDENT, seq: ++this.last_seq, idempotency_key },
    ]);
  }

  /**
   * Finishes the report. Only while nothing is waiting, so READY is never claimed over unsent edits.
   * @returns Resolves when the server has marked the report ready.
   * @throws The HTTP error when the server refuses (REPORT_NOT_READY carries the blockers).
   */
  public async mark_ready(): Promise<void> {
    const confirmed = this.server_report();
    if (confirmed === null || this.queue().length > 0) return;
    this.server_report.set(await firstValueFrom(this.api.mark_ready(confirmed.report_id)));
  }

  /**
   * Opens a READY report for editing again.
   * @returns Resolves when the report is a draft again.
   * @throws The HTTP error when the server refuses.
   */
  public async reopen(): Promise<void> {
    const confirmed = this.server_report();
    if (confirmed === null || this.queue().length > 0) return;
    this.server_report.set(await firstValueFrom(this.api.reopen(confirmed.report_id)));
  }

  /**
   * Sends the waiting edits, oldest first, until the queue is empty, the device is offline or the
   * server cannot be reached (then it waits, longer each time, and tries again). Safe to call at any
   * time: a second call while one is running does nothing, and the running one picks up new edits.
   * @returns Resolves when this pass has stopped.
   */
  public async flush(): Promise<void> {
    if (this.is_flushing() || this.is_destroyed) return;
    this.clear_retry_timer();
    this.is_flushing.set(true);
    try {
      while (this.queue().length > 0 && this.is_online() && !this.is_destroyed) {
        const operation = this.queue()[0];
        this.in_flight_seq = operation.seq;
        const accepted = await this.send(operation);
        this.in_flight_seq = null;
        if (!accepted) {
          this.schedule_retry();
          return;
        }
      }
      if (this.needs_resync && this.queue().length === 0) await this.resync();
    } finally {
      this.is_flushing.set(false);
      this.in_flight_seq = null;
    }
  }

  private enqueue(next_queue: QueuedOperation[]): Promise<void> {
    this.queue.set(next_queue);
    this.persist();
    return this.flush();
  }

  private persist(): void {
    const confirmed = this.server_report();
    if (confirmed === null) return;
    write_queue_record({
      report_id: confirmed.report_id,
      revision: this.revision,
      last_seq: this.last_seq,
      queue: this.queue(),
    });
  }

  /** Sends one edit. True means it is finished with (accepted or dropped); false means try again later. */
  private async send(operation: QueuedOperation): Promise<boolean> {
    try {
      const response = await this.dispatch(operation);
      if (response !== null) this.server_report.set(response);
      this.finish(operation);
      this.failed_attempts = 0;
      return true;
    } catch (error) {
      const { code } = classify_report_error(error);
      if (
        code === MatchReportErrorCode.IDEMPOTENCY_KEY_CONFLICT &&
        this.regenerate_key(operation)
      ) {
        return true;
      }
      if (classify_flush_failure(error) === FlushFailure.RETRY) {
        // A card that was never acknowledged and has since been removed is not sent again, so a late retry
        // can never bring back a card the referee took away.
        if (this.cancel_removed_addition(operation)) return true;
        return false;
      }
      console.error('A match report change was refused and will not be sent again', error);
      const { kind } = classify_report_error(error);
      this.finish(operation);
      this.failed_attempts = 0;
      if (code === MatchReportErrorCode.REPORT_NOT_EDITABLE) this.needs_resync = true;
      this.dropped_subject.next({ kind: operation.kind, reason: kind, code });
      return true;
    }
  }

  /** Calls the endpoint for one edit; null when there is nothing to tell the server. */
  private dispatch(operation: QueuedOperation): Promise<IMatchReportView | null> {
    const report_id = this.server_report()?.report_id ?? '';
    switch (operation.kind) {
      case ReportOperationKind.SET_SCORES:
        return firstValueFrom(
          this.api.set_scores(report_id, {
            home_score: operation.home_score,
            away_score: operation.away_score,
            client_revision: operation.client_revision,
          }),
        );
      case ReportOperationKind.ADD_INCIDENT:
        return firstValueFrom(
          this.api.add_incident(report_id, {
            idempotency_key: operation.idempotency_key,
            team_side: operation.team_side,
            incident_type: operation.incident_type,
            jersey_number: operation.jersey_number,
            minute: operation.minute,
            reason_code: operation.reason_code,
            notes: operation.notes,
          }),
        );
      case ReportOperationKind.REMOVE_INCIDENT: {
        // The card is found by its key: it may have been added a moment ago, so only the server knows its id.
        const stored = this.server_report()?.incidents.find(
          (item) => item.idempotency_key === operation.idempotency_key,
        );
        return stored
          ? firstValueFrom(this.api.remove_incident(report_id, stored.incident_id))
          : Promise.resolve(null);
      }
    }
  }

  /**
   * A card key the server says belongs to another report: give the card a new key and send it once more.
   * Returns false when it was already given a new key (or is not a card), so the conflict is surfaced.
   */
  private regenerate_key(operation: QueuedOperation): boolean {
    if (operation.kind !== ReportOperationKind.ADD_INCIDENT || operation.key_regenerated) {
      return false;
    }
    const fresh_key = generate_idempotency_key();
    this.queue.update((waiting) =>
      waiting.map((item) => {
        if (item.seq === operation.seq) {
          return { ...operation, idempotency_key: fresh_key, key_regenerated: true };
        }
        if (
          item.kind === ReportOperationKind.REMOVE_INCIDENT &&
          item.idempotency_key === operation.idempotency_key
        ) {
          return { ...item, idempotency_key: fresh_key };
        }
        return item;
      }),
    );
    this.persist();
    return true;
  }

  /** Drops a card whose sending failed for now, together with the removal queued behind it. */
  private cancel_removed_addition(operation: QueuedOperation): boolean {
    if (operation.kind !== ReportOperationKind.ADD_INCIDENT) return false;
    const removal = this.queue().find(
      (item) =>
        item.kind === ReportOperationKind.REMOVE_INCIDENT &&
        item.idempotency_key === operation.idempotency_key,
    );
    if (!removal) return false;
    this.queue.update((waiting) =>
      waiting.filter((item) => item.seq !== operation.seq && item.seq !== removal.seq),
    );
    this.persist();
    return true;
  }

  private finish(operation: QueuedOperation): void {
    this.queue.update((waiting) => waiting.filter((item) => item.seq !== operation.seq));
    this.persist();
  }

  /** After a locked-report refusal the server's report (not the one we hold) is the truth. */
  private async resync(): Promise<void> {
    this.needs_resync = false;
    const confirmed = this.server_report();
    if (confirmed === null) return;
    try {
      this.server_report.set(await firstValueFrom(this.api.get_report(confirmed.report_id)));
    } catch (error) {
      console.error('Could not refresh the match report', error);
    }
  }

  private schedule_retry(): void {
    this.failed_attempts++;
    this.is_retry_scheduled.set(true);
    this.retry_timer = setTimeout(() => {
      this.retry_timer = undefined;
      this.is_retry_scheduled.set(false);
      void this.flush();
    }, backoff_delay(this.failed_attempts));
  }

  private clear_retry_timer(): void {
    if (this.retry_timer !== undefined) clearTimeout(this.retry_timer);
    this.retry_timer = undefined;
    this.is_retry_scheduled.set(false);
  }
}
