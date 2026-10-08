import { PreviewWarningCode } from '../enums/preview_warning_code.enum';
import { IDraftPreview } from '../models/draft_preview.model';

/**
 * Builds a preview fixture.
 * @param overrides Fields to change from a clean preview of 4 games for 2 people.
 * @returns The preview.
 */
export function make_draft_preview(overrides: Partial<IDraftPreview> = {}): IDraftPreview {
  return {
    subject: 'Games available this weekend',
    html: '<p>Riverside Park</p><p>Lions vs Tigers</p>',
    text: 'Riverside Park\nLions vs Tigers',
    game_count: 4,
    eligible_recipient_count: 2,
    skipped: { unsubscribed: 1, missing: 0 },
    warnings: [],
    ...overrides,
  };
}

/** A clean preview. */
export const CLEAN_PREVIEW: IDraftPreview = make_draft_preview();

/** A preview that must not be sent: nothing is set up and nobody would receive it. */
export const BLOCKED_PREVIEW: IDraftPreview = make_draft_preview({
  eligible_recipient_count: 0,
  warnings: [PreviewWarningCode.EMAIL_NOT_CONFIGURED, PreviewWarningCode.NO_RECIPIENTS],
});
