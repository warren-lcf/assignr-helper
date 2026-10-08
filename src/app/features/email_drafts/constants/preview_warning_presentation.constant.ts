import { PreviewFixTarget } from '../enums/preview_fix_target.enum';
import { PreviewWarningCode } from '../enums/preview_warning_code.enum';
import { IPreviewWarningPresentation } from '../models/preview_warning_presentation.model';

/** How each known preview warning is shown. Texts are English keys, translated where shown. */
export const PREVIEW_WARNING_PRESENTATION: Readonly<
  Record<PreviewWarningCode, IPreviewWarningPresentation>
> = {
  [PreviewWarningCode.EMAIL_NOT_CONFIGURED]: {
    is_blocking: true,
    icon: 'settings',
    headline: 'Sending is not set up yet',
    advice: 'Add your SendGrid API key and sender address in the sender settings.',
    fix_target: PreviewFixTarget.SETTINGS,
    fix_label: 'Open sender settings',
  },
  [PreviewWarningCode.NO_GAMES]: {
    is_blocking: true,
    icon: 'sports_soccer',
    headline: 'No open games match this draft',
    advice: 'Loosen the game filters, or wait until more games open, then save the draft again.',
    fix_target: null,
    fix_label: null,
  },
  [PreviewWarningCode.NO_RECIPIENTS]: {
    is_blocking: true,
    icon: 'group_off',
    headline: 'Nobody would receive this email',
    advice:
      'Add contacts who agreed to receive these emails, or choose different recipients, then save the draft again.',
    fix_target: PreviewFixTarget.CONTACTS,
    fix_label: 'Go to contacts',
  },
  [PreviewWarningCode.TOO_MANY_RECIPIENTS]: {
    is_blocking: true,
    icon: 'groups',
    headline: 'Too many recipients for one send',
    advice: 'One send can reach at most 100 people. Choose specific contacts and send in batches.',
    fix_target: null,
    fix_label: null,
  },
  [PreviewWarningCode.NO_POSTAL_ADDRESS]: {
    is_blocking: false,
    icon: 'mail',
    headline: 'No postal address in the sender settings',
    advice:
      'Recipients should be able to see who sent the email. Add a postal address in the sender settings.',
    fix_target: PreviewFixTarget.SETTINGS,
    fix_label: 'Open sender settings',
  },
};

/** How a warning code this app does not know is shown: advisory, with generic words. */
export const UNKNOWN_PREVIEW_WARNING: IPreviewWarningPresentation = {
  is_blocking: false,
  icon: 'info',
  headline: 'The preview reported something to check',
  advice: 'Read the preview carefully before you send.',
  fix_target: null,
  fix_label: null,
};
