import { QuickLinkState } from '../enums/quick_link_state.enum';
import { ICreatedQuickLink } from '../models/created_quick_link.model';
import { IQuickLinkView } from '../models/quick_link_view.model';

/** A fixed "now" for specs: 2026-10-07 12:00 UTC. */
export const NOW_MS = Date.UTC(2026, 9, 7, 12, 0, 0);

/** The secret a fixture link is "opened" with. Obviously fake. */
export const FAKE_TOKEN = 'fake-token-for-specs-0123456789';

/**
 * Builds a quick link fixture.
 * @param overrides Fields to change from an unrestricted, never-expiring, active link.
 * @returns The link.
 */
export function make_quick_link_view(overrides: Partial<IQuickLinkView> = {}): IQuickLinkView {
  return {
    link_id: 'link-1',
    scope: { organization_ids: [], levels: [], date_start: null, date_end: null },
    state: QuickLinkState.ACTIVE,
    expires_at: null,
    revoked_at: null,
    last_viewed_at: null,
    view_count: 0,
    created_at: Date.UTC(2026, 9, 5, 15, 4, 0),
    ...overrides,
  };
}

/** An active link restricted to two levels and a date window, opened a few times. */
export const ACTIVE_LINK: IQuickLinkView = make_quick_link_view({
  link_id: 'link-1',
  scope: {
    organization_ids: [],
    levels: ['Premier', 'Select'],
    date_start: Date.UTC(2026, 9, 10),
    date_end: Date.UTC(2026, 9, 20),
  },
  expires_at: Date.UTC(2026, 10, 5, 15, 4, 0),
  last_viewed_at: Date.UTC(2026, 9, 6, 9, 30, 0),
  view_count: 1234,
});

/** A link whose expiry has passed. */
export const EXPIRED_LINK: IQuickLinkView = make_quick_link_view({
  link_id: 'link-2',
  state: QuickLinkState.EXPIRED,
  expires_at: Date.UTC(2026, 9, 1),
  view_count: 7,
  created_at: Date.UTC(2026, 8, 20, 8, 0, 0),
});

/** A link revoked by hand. */
export const REVOKED_LINK: IQuickLinkView = make_quick_link_view({
  link_id: 'link-3',
  state: QuickLinkState.REVOKED,
  revoked_at: Date.UTC(2026, 9, 2, 10, 0, 0),
  created_at: Date.UTC(2026, 8, 1, 8, 0, 0),
});

/** One link in each state, newest first. */
export const QUICK_LINK_FIXTURES: readonly IQuickLinkView[] = [
  ACTIVE_LINK,
  EXPIRED_LINK,
  REVOKED_LINK,
];

/**
 * What creating a link returns.
 * @param overrides Fields to change.
 * @returns The created link with its one-time token.
 */
export function make_created_quick_link(
  overrides: Partial<ICreatedQuickLink> = {},
): ICreatedQuickLink {
  return {
    quick_link: make_quick_link_view({ link_id: 'link-new', created_at: NOW_MS }),
    token: FAKE_TOKEN,
    path: `/q/${FAKE_TOKEN}`,
    ...overrides,
  };
}
