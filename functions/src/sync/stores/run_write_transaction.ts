import { Database, Transaction } from '@google-cloud/spanner';

/**
 * Runs `work` inside a Spanner read-write transaction and commits it. Any error
 * rolls the transaction back before being rethrown, so a session is never left
 * holding locks. `work` may run more than once when Spanner aborts the transaction,
 * so it must read everything it depends on inside the callback.
 * @param database Database to run against.
 * @param work Reads and buffers writes using the supplied transaction; must not commit.
 * @returns Whatever `work` returned, once the commit succeeded.
 */
export async function run_write_transaction<T>(
  database: Database,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return database.runTransactionAsync(async (transaction) => {
    try {
      const result = await work(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await rollback_quietly(transaction);
      throw error;
    }
  });
}

/**
 * Rolls a transaction back, ignoring a failure so the original error is not masked.
 * Spanner rejects a rollback of a transaction it already aborted, which is expected.
 * @param transaction Transaction to roll back.
 * @returns Resolves once the rollback was attempted.
 */
async function rollback_quietly(transaction: Transaction): Promise<void> {
  try {
    await transaction.rollback();
  } catch {
    // The transaction may already be aborted or ended; the caller reports the original error.
  }
}
