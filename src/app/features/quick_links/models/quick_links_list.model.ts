import { IQuickLinkView } from './quick_link_view.model';

/** The payload of `GET /api/quick_links`. */
export interface IQuickLinksList {
  /** The tenant's links, newest first. */
  quick_links: IQuickLinkView[];
}
