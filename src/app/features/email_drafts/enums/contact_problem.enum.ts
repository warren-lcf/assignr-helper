/** Why a pasted line cannot become a contact. */
export enum ContactProblem {
  /** No usable email address on the line. */
  INVALID_EMAIL = 'INVALID_EMAIL',
  /** The same address appears on an earlier line. */
  DUPLICATE = 'DUPLICATE',
  /** The name is longer than the API allows. */
  NAME_TOO_LONG = 'NAME_TOO_LONG',
  /** The address is longer than the API allows. */
  EMAIL_TOO_LONG = 'EMAIL_TOO_LONG',
}
