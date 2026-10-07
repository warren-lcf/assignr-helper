import { IStoredQuickLink } from './stored_quick_link.model.js';

/** A freshly created quick link and the one and only copy of its token. */
export interface ICreatedQuickLink {
  link: IStoredQuickLink;
  /** The bearer token. It is not stored anywhere and cannot be shown again. */
  token: string;
}
