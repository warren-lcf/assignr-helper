import { IQuickLinkView } from './quick_link_view.model';

/**
 * What creating a link returns. The token appears here and nowhere else: the
 * server keeps only its hash, so it can never be shown again.
 */
export interface ICreatedQuickLink {
  /** The new link's details. */
  quick_link: IQuickLinkView;
  /** The secret that opens the link. */
  token: string;
  /** App path of the public page, `/q/<token>`. */
  path: string;
}
