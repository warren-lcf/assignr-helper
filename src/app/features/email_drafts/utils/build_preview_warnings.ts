import {
  PREVIEW_WARNING_PRESENTATION,
  UNKNOWN_PREVIEW_WARNING,
} from '../constants/preview_warning_presentation.constant';
import { MAX_RECIPIENTS_PER_SEND } from '../constants/email_limits.constant';
import { PreviewWarningCode } from '../enums/preview_warning_code.enum';
import { IDraftPreview } from '../models/draft_preview.model';
import { IPreviewWarningPresentation } from '../models/preview_warning_presentation.model';
import { IPreviewWarningView } from '../models/preview_warning_view.model';

/** Translates an English key. */
type Translate = (key: string) => string;

function is_known_code(code: string): code is PreviewWarningCode {
  return Object.values<string>(PreviewWarningCode).includes(code);
}

/**
 * The warnings to show for a preview: the server's own, plus the blocking
 * ones the numbers imply (no games, nobody to email, more than one send
 * allows) in case the server did not say so, so sending can never be enabled
 * against the numbers on screen. Each appears once; blocking ones come first.
 * Codes this app does not know are advisory, with generic words.
 * @param preview The preview.
 * @param translate Translates an English key.
 * @returns The warnings, ready to draw.
 */
export function build_preview_warnings(
  preview: IDraftPreview,
  translate: Translate,
): IPreviewWarningView[] {
  const codes = new Set<string>(preview.warnings);
  if (preview.game_count <= 0) codes.add(PreviewWarningCode.NO_GAMES);
  if (preview.eligible_recipient_count <= 0) codes.add(PreviewWarningCode.NO_RECIPIENTS);
  if (preview.eligible_recipient_count > MAX_RECIPIENTS_PER_SEND) {
    codes.add(PreviewWarningCode.TOO_MANY_RECIPIENTS);
  }

  const views = [...codes].map((code): IPreviewWarningView => {
    const presentation: IPreviewWarningPresentation = is_known_code(code)
      ? PREVIEW_WARNING_PRESENTATION[code]
      : UNKNOWN_PREVIEW_WARNING;
    return {
      code,
      is_blocking: presentation.is_blocking,
      icon: presentation.icon,
      headline: translate(presentation.headline),
      advice: translate(presentation.advice),
      fix_target: presentation.fix_target,
      fix_label: presentation.fix_label ? translate(presentation.fix_label) : null,
    };
  });
  return [
    ...views.filter((view) => view.is_blocking),
    ...views.filter((view) => !view.is_blocking),
  ];
}

/**
 * Whether any of the warnings stops the send.
 * @param warnings The warnings from {@link build_preview_warnings}.
 * @returns True when sending must stay disabled.
 */
export function has_blocking_warning(warnings: readonly IPreviewWarningView[]): boolean {
  return warnings.some((warning) => warning.is_blocking);
}
