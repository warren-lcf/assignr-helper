/** Longest subject the drafts API accepts. */
export const SUBJECT_MAX_LENGTH = 200;

/** Longest intro message the drafts API accepts. */
export const INTRO_MAX_LENGTH = 2000;

/** Longest search text the games filters accept. */
export const DRAFT_SEARCH_MAX_LENGTH = 100;

/** Fewest days a quick link in an email may live. */
export const QUICK_LINK_EXPIRY_MIN_DAYS = 1;

/** Most days a quick link in an email may live. */
export const QUICK_LINK_EXPIRY_MAX_DAYS = 90;

/** Days a quick link in an email lives unless the sender chooses otherwise. */
export const QUICK_LINK_EXPIRY_DEFAULT_DAYS = 14;

/** Most people one send may reach. */
export const MAX_RECIPIENTS_PER_SEND = 100;

/** Most contacts one paste import may carry. */
export const MAX_IMPORT_ENTRIES = 200;

/** Longest contact name the API accepts. */
export const CONTACT_NAME_MAX_LENGTH = 100;

/** Longest email address the API accepts. */
export const EMAIL_ADDRESS_MAX_LENGTH = 254;

/** Longest sender name. */
export const FROM_NAME_MAX_LENGTH = 100;

/** Longest postal address. */
export const POSTAL_ADDRESS_MAX_LENGTH = 500;

/** How many recipient names the send confirmation lists before saying "and N more". */
export const SEND_DIALOG_NAME_LIMIT = 5;

/** How many skeleton cards stand in while a list loads. */
export const EMAIL_SKELETON_COUNT = 3;

/** Longest pasted line echoed back in an import problem list. */
export const IMPORT_PROBLEM_TEXT_MAX_LENGTH = 120;
