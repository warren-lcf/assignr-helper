/** Options shared by the in-memory store implementations. */
export interface IInMemoryStoreOptions {
  /** Produces ids for new rows. Defaults to `crypto.randomUUID`. */
  generate_id?: () => string;
}
