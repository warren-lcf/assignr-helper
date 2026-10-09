import type { FeedTokenStore } from '@hch-shared-libraries/core-server';

/**
 * Wraps a `FeedTokenStore` so that a failure to record a fetch is logged and swallowed. The
 * library's `resolve_feed_token` awaits `record_fetch` and would otherwise fail the whole feed
 * request over a counter. Only the tenant id is logged, never anything derived from the token.
 */
export class BestEffortFetchRecordingStore implements FeedTokenStore {
  /**
   * Creates the wrapper.
   * @param inner The store whose fetch recording may fail.
   */
  public constructor(private readonly inner: FeedTokenStore) {}

  /**
   * Delegates to the inner store.
   * @param subscriber_id The tenant id.
   * @param token_hash SHA-256 hex of the new token.
   * @returns Resolves when written.
   */
  public set_token(subscriber_id: string, token_hash: string): Promise<void> {
    return this.inner.set_token(subscriber_id, token_hash);
  }

  /**
   * Delegates to the inner store.
   * @param token_hash SHA-256 hex of the presented token.
   * @returns The tenant id, or null.
   */
  public find_subscriber_by_token_hash(token_hash: string): Promise<string | null> {
    return this.inner.find_subscriber_by_token_hash(token_hash);
  }

  /**
   * Records the fetch; on failure logs it and resolves anyway.
   * @param subscriber_id The tenant id.
   * @param fetched_at_utc_ms UTC milliseconds of the fetch.
   * @returns Resolves once the fetch was recorded or the failure was logged.
   */
  public async record_fetch(subscriber_id: string, fetched_at_utc_ms: number): Promise<void> {
    try {
      await this.inner.record_fetch(subscriber_id, fetched_at_utc_ms);
    } catch (error) {
      console.error('Could not record a calendar feed fetch', subscriber_id, error);
    }
  }

  /**
   * Delegates to the inner store.
   * @param subscriber_id The tenant id.
   * @returns Resolves when removed.
   */
  public delete_token(subscriber_id: string): Promise<void> {
    return this.inner.delete_token(subscriber_id);
  }
}
