import { PreviewFixTarget } from '../enums/preview_fix_target.enum';
import { PreviewWarningCode } from '../enums/preview_warning_code.enum';
import { BLOCKED_PREVIEW, CLEAN_PREVIEW, make_draft_preview } from '../mocks/draft_preview.mock';
import { build_preview_warnings, has_blocking_warning } from './build_preview_warnings';

const translate = (key: string): string => `T(${key})`;

describe('build_preview_warnings', () => {
  it('has nothing to say about a clean preview', () => {
    const warnings = build_preview_warnings(CLEAN_PREVIEW, translate);

    expect(warnings).toEqual([]);
    expect(has_blocking_warning(warnings)).toBe(false);
  });

  it('translates each known warning and points to where it is fixed', () => {
    const warnings = build_preview_warnings(BLOCKED_PREVIEW, translate);

    expect(warnings.map((warning) => warning.code)).toEqual([
      PreviewWarningCode.EMAIL_NOT_CONFIGURED,
      PreviewWarningCode.NO_RECIPIENTS,
    ]);
    expect(warnings[0]).toMatchObject({
      is_blocking: true,
      headline: 'T(Sending is not set up yet)',
      fix_target: PreviewFixTarget.SETTINGS,
      fix_label: 'T(Open sender settings)',
    });
    expect(warnings[1].fix_target).toBe(PreviewFixTarget.CONTACTS);
    expect(has_blocking_warning(warnings)).toBe(true);
  });

  it('lists the advisory postal address warning after the blocking ones', () => {
    const warnings = build_preview_warnings(
      make_draft_preview({
        warnings: [PreviewWarningCode.NO_POSTAL_ADDRESS, PreviewWarningCode.NO_GAMES],
        game_count: 0,
      }),
      translate,
    );

    expect(warnings.map((warning) => [warning.code, warning.is_blocking])).toEqual([
      [PreviewWarningCode.NO_GAMES, true],
      [PreviewWarningCode.NO_POSTAL_ADDRESS, false],
    ]);
  });

  it('treats an unknown code as advisory with generic words', () => {
    const [warning] = build_preview_warnings(
      make_draft_preview({ warnings: ['something_new'] }),
      translate,
    );

    expect(warning).toMatchObject({
      code: 'something_new',
      is_blocking: false,
      headline: 'T(The preview reported something to check)',
      fix_target: null,
      fix_label: null,
    });
  });

  it('adds the blocking warnings the numbers imply when the server did not', () => {
    const none = build_preview_warnings(
      make_draft_preview({ game_count: 0, eligible_recipient_count: 0 }),
      translate,
    );
    const too_many = build_preview_warnings(
      make_draft_preview({ eligible_recipient_count: 101 }),
      translate,
    );

    expect(none.map((warning) => warning.code)).toEqual([
      PreviewWarningCode.NO_GAMES,
      PreviewWarningCode.NO_RECIPIENTS,
    ]);
    expect(too_many.map((warning) => warning.code)).toEqual([
      PreviewWarningCode.TOO_MANY_RECIPIENTS,
    ]);
  });

  it('shows a code once however often it is reported or implied', () => {
    const warnings = build_preview_warnings(
      make_draft_preview({
        warnings: [PreviewWarningCode.NO_RECIPIENTS, PreviewWarningCode.NO_RECIPIENTS],
        eligible_recipient_count: 0,
      }),
      translate,
    );

    expect(warnings).toHaveLength(1);
  });
});
