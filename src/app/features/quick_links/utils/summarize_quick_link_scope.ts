import { IQuickLinkScope } from '../models/quick_link_scope.model';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Describes what a link shows as short lines: the levels, the dates and (when
 * the link was restricted that way) the number of organizations.
 * @param scope The link's scope.
 * @param format_date Formats a UTC-midnight calendar date for display.
 * @param translate Translates an English key.
 * @returns One line per restriction; "All levels" and "Any date" when there is none.
 */
export function summarize_quick_link_scope(
  scope: IQuickLinkScope,
  format_date: (utc_midnight_ms: number) => string,
  translate: Translate,
): string[] {
  const lines: string[] = [];
  lines.push(
    scope.levels.length > 0
      ? translate('Levels: {{levels}}', { levels: scope.levels.join(', ') })
      : translate('All levels'),
  );
  if (scope.date_start !== null && scope.date_end !== null) {
    lines.push(
      translate('{{start}} to {{end}}', {
        start: format_date(scope.date_start),
        end: format_date(scope.date_end),
      }),
    );
  } else if (scope.date_start !== null) {
    lines.push(translate('From {{start}}', { start: format_date(scope.date_start) }));
  } else if (scope.date_end !== null) {
    lines.push(translate('Until {{end}}', { end: format_date(scope.date_end) }));
  } else {
    lines.push(translate('Any date'));
  }
  if (scope.organization_ids.length > 0) {
    lines.push(
      scope.organization_ids.length === 1
        ? translate('1 organization')
        : translate('{{count}} organizations', { count: scope.organization_ids.length }),
    );
  }
  return lines;
}
