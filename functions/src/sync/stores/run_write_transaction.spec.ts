import { Database, Transaction } from '@google-cloud/spanner';
import { describe, expect, it, vi } from 'vitest';
import { run_write_transaction } from './run_write_transaction.js';

function make_fakes(rollback_error: Error | null = null) {
  const transaction = {
    commit: vi.fn(async () => undefined),
    rollback: vi.fn(async () => {
      if (rollback_error) {
        throw rollback_error;
      }
    }),
  };
  const database = {
    runTransactionAsync: vi.fn(async (run_fn: (tx: Transaction) => Promise<unknown>) =>
      run_fn(transaction as unknown as Transaction),
    ),
  };
  return { transaction, database: database as unknown as Database };
}

describe('run_write_transaction', () => {
  it('commits after the work succeeds and returns its result', async () => {
    const { transaction, database } = make_fakes();

    const result = await run_write_transaction(database, async () => 'done');

    expect(result).toBe('done');
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
  });

  it('rolls back and rethrows when the work fails, without committing', async () => {
    const { transaction, database } = make_fakes();

    await expect(
      run_write_transaction(database, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(transaction.commit).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('rolls back and rethrows when the commit fails', async () => {
    const { transaction, database } = make_fakes();
    transaction.commit.mockRejectedValueOnce(new Error('aborted'));

    await expect(run_write_transaction(database, async () => 1)).rejects.toThrow('aborted');

    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  it('reports the original error even when the rollback also fails', async () => {
    const { database } = make_fakes(new Error('rollback failed'));

    await expect(
      run_write_transaction(database, async () => {
        throw new Error('original');
      }),
    ).rejects.toThrow('original');
  });
});
