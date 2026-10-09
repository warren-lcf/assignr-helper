import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { IQueueRecord } from '../models/queue_record.model';
import { queue_storage_key, read_queue_record, write_queue_record } from './report_queue_storage';

const RECORD: IQueueRecord = {
  report_id: 'report-1',
  revision: 4,
  last_seq: 7,
  queue: [
    {
      kind: ReportOperationKind.SET_SCORES,
      seq: 7,
      home_score: 1,
      away_score: 0,
      notes: null,
      client_revision: 4,
    },
  ],
};

describe('report queue storage', () => {
  let logged: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps a queue under its report’s own key and reads it back', () => {
    write_queue_record(RECORD);

    expect(localStorage.getItem(queue_storage_key('report-1'))).not.toBeNull();
    expect(read_queue_record('report-1')).toEqual(RECORD);
    expect(read_queue_record('report-2')).toBeNull();
  });

  it('removes the entry once the queue is empty, since the server holds everything', () => {
    write_queue_record(RECORD);
    write_queue_record({ ...RECORD, queue: [] });

    expect(localStorage.getItem(queue_storage_key('report-1'))).toBeNull();
  });

  it('reads nothing when nothing was kept', () => {
    expect(read_queue_record('report-1')).toBeNull();
  });

  it('reads nothing from text that is not JSON, and says why', () => {
    localStorage.setItem(queue_storage_key('report-1'), '{oops');

    expect(read_queue_record('report-1')).toBeNull();
    expect(logged).toHaveBeenCalled();
  });

  it('reads nothing from an entry of the wrong shape or for another report', () => {
    localStorage.setItem(queue_storage_key('report-1'), JSON.stringify({ queue: 'no' }));
    expect(read_queue_record('report-1')).toBeNull();

    localStorage.setItem(
      queue_storage_key('report-1'),
      JSON.stringify({ ...RECORD, report_id: 'report-9' }),
    );
    expect(read_queue_record('report-1')).toBeNull();
  });

  it('drops queue entries it does not understand and keeps the rest', () => {
    localStorage.setItem(
      queue_storage_key('report-1'),
      JSON.stringify({ ...RECORD, queue: [...RECORD.queue, { kind: 'NOPE', seq: 1 }, 'x', null] }),
    );

    expect(read_queue_record('report-1')?.queue).toEqual(RECORD.queue);
  });

  it('works with browser storage blocked: reading finds nothing, writing does not throw', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });

    expect(read_queue_record('report-1')).toBeNull();
    expect(() => write_queue_record(RECORD)).not.toThrow();
    expect(logged).toHaveBeenCalledTimes(2);
  });
});
