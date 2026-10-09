import { ReportErrorKind } from '../enums/report_error_kind.enum';
import { ReportOperationKind } from '../enums/report_operation_kind.enum';
import { describe_dropped_operation } from './describe_dropped_operation';

const translate = (key: string, params?: Record<string, string | number>): string =>
  params ? `${key} ${JSON.stringify(params)}` : key;

describe('describe_dropped_operation', () => {
  it('tells the referee a locked report needs reopening', () => {
    expect(
      describe_dropped_operation(
        {
          kind: ReportOperationKind.SET_SCORES,
          reason: ReportErrorKind.GENERIC,
          code: 'REPORT_NOT_EDITABLE',
        },
        translate,
      ),
    ).toBe('This report is locked, so a change was not saved. Reopen it to edit.');
  });

  it('names the card limit', () => {
    expect(
      describe_dropped_operation(
        {
          kind: ReportOperationKind.ADD_INCIDENT,
          reason: ReportErrorKind.GENERIC,
          code: 'TOO_MANY_INCIDENTS',
        },
        translate,
      ),
    ).toBe('A report holds at most {{count}} cards, so the last card was not saved. {"count":60}');
  });

  it('says when the report no longer exists', () => {
    expect(
      describe_dropped_operation(
        {
          kind: ReportOperationKind.REMOVE_INCIDENT,
          reason: ReportErrorKind.NOT_FOUND,
          code: 'NOT_FOUND',
        },
        translate,
      ),
    ).toBe('This report no longer exists, so a change was not saved.');
  });

  it('gives a plain message for any other refusal', () => {
    expect(
      describe_dropped_operation(
        {
          kind: ReportOperationKind.ADD_INCIDENT,
          reason: ReportErrorKind.GENERIC,
          code: 'VALIDATION_ERROR',
        },
        translate,
      ),
    ).toBe('A change could not be saved. Check the report and enter it again.');
  });
});
