/** Fixed limits of the contacts API. */
export const CONTACT_LIMITS = {
  /** Longest display name, after trimming. */
  MAX_DISPLAY_NAME_LENGTH: 100,
  /** Most contacts one tenant may hold, which is also how many `GET /api/contacts` can list. */
  MAX_CONTACTS_PER_TENANT: 1000,
  /** Most entries one import may carry. */
  MAX_IMPORT_ENTRIES: 200,
  /** Longest raw text accepted for one imported cell before row validation. */
  MAX_IMPORT_CELL_LENGTH: 1000,
} as const;
