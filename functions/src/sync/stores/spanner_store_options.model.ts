/** Options shared by the Spanner store implementations. */
export interface ISpannerStoreOptions {
  /** Produces ids for new rows. Defaults to `crypto.randomUUID`. */
  generate_id?: () => string;
}
