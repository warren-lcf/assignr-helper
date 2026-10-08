import { DraftStatus } from '../enums/draft_status.enum';
import { RecipientMode } from '../enums/recipient_mode.enum';
import { IEmailDraft } from '../models/email_draft.model';

/** A fixed "now" for specs: 2026-10-07 12:00 UTC. */
export const DRAFT_NOW_MS = Date.UTC(2026, 9, 7, 12, 0, 0);

/**
 * Builds a draft fixture.
 * @param overrides Fields to change from an unsent draft with no extras.
 * @returns The draft.
 */
export function make_email_draft(overrides: Partial<IEmailDraft> = {}): IEmailDraft {
  return {
    draft_id: 'draft-1',
    subject: 'Games available this weekend',
    intro: null,
    filters: {},
    include_quick_link: false,
    quick_link_expiry_days: 14,
    recipient_mode: RecipientMode.ALL_CONSENTED,
    contact_ids: [],
    status: DraftStatus.DRAFT,
    recipient_count: null,
    sent_at: null,
    created_at: Date.UTC(2026, 9, 5, 15, 4, 0),
    updated_at: Date.UTC(2026, 9, 5, 15, 4, 0),
    ...overrides,
  };
}

/** An unsent draft with a quick link, a level filter and a date window. */
export const OPEN_DRAFT: IEmailDraft = make_email_draft({
  intro: 'Hello referees, here is what is open.',
  filters: {
    level: 'Premier',
    only_with_open_slots: true,
    date_from: Date.UTC(2026, 9, 10),
    date_to: Date.UTC(2026, 9, 12),
  },
  include_quick_link: true,
  quick_link_expiry_days: 7,
});

/** A draft sent to everyone. */
export const SENT_DRAFT: IEmailDraft = make_email_draft({
  draft_id: 'draft-2',
  subject: 'Last weekend',
  status: DraftStatus.SENT,
  recipient_count: 42,
  sent_at: Date.UTC(2026, 9, 1, 8, 0, 0),
  created_at: Date.UTC(2026, 8, 30, 8, 0, 0),
});

/** A draft some recipients did not receive. */
export const PARTIAL_DRAFT: IEmailDraft = make_email_draft({
  draft_id: 'draft-3',
  subject: 'Midweek games',
  status: DraftStatus.PARTIALLY_SENT,
  recipient_count: 10,
  sent_at: Date.UTC(2026, 8, 28, 8, 0, 0),
  created_at: Date.UTC(2026, 8, 27, 8, 0, 0),
});

/** A draft whose send is running. */
export const SENDING_DRAFT: IEmailDraft = make_email_draft({
  draft_id: 'draft-4',
  subject: 'Right now',
  status: DraftStatus.SENDING,
});

/** A draft for chosen contacts only. */
export const SELECTED_DRAFT: IEmailDraft = make_email_draft({
  draft_id: 'draft-5',
  subject: 'Just for two',
  recipient_mode: RecipientMode.SELECTED,
  contact_ids: ['contact-1', 'contact-2'],
});

/** One draft in each status, newest first. */
export const DRAFT_FIXTURES: readonly IEmailDraft[] = [
  OPEN_DRAFT,
  SENT_DRAFT,
  PARTIAL_DRAFT,
  SENDING_DRAFT,
];
