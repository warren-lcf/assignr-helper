import { evaluate_quick_link_state } from '../../domain/quick_links/evaluate_quick_link_state.js';
import { IStoredQuickLink } from '../models/stored_quick_link.model.js';
import { IQuickLinkView } from './quick_link_view.model.js';

/**
 * Projects a stored quick link to its API shape, built from an explicit allow-list of fields so
 * neither the token hash nor anything added to the row later can leak.
 * @param link Stored link.
 * @param now The current instant in UTC milliseconds, used to tell whether it has expired.
 * @returns The public view.
 */
export function to_quick_link_view(link: IStoredQuickLink, now: number): IQuickLinkView {
  return {
    link_id: link.link_id,
    scope: {
      organization_ids: [...link.scope.organization_ids],
      levels: [...link.scope.levels],
      date_start: link.scope.date_start,
      date_end: link.scope.date_end,
    },
    state: evaluate_quick_link_state(link, now),
    expires_at: link.expires_at,
    revoked_at: link.revoked_at,
    last_viewed_at: link.last_viewed_at,
    view_count: link.view_count,
    created_at: link.created_at,
  };
}
