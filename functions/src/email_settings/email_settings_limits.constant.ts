/** Fixed limits of the email settings API. */
export const EMAIL_SETTINGS_LIMITS = {
  /** Longest API key accepted. */
  MAX_API_KEY_LENGTH: 512,
  /** Longest sender display name. */
  MAX_FROM_NAME_LENGTH: 100,
  /** Longest postal address. */
  MAX_POSTAL_ADDRESS_LENGTH: 300,
} as const;
