import { UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { DATE_HEADING_FORMAT, DATE_HEADING_TIME_ZONE } from '../constants/date_heading.constant';

/**
 * The text of a date group's header: the weekday, month and day of the calendar date ("Saturday,
 * Oct 10"), or "Date to be announced" when the date is not known. The date is formatted in UTC
 * because a calendar date is stored as UTC midnight; any other zone could name the day before.
 * @param local_date UTC-midnight milliseconds of the calendar date, or null when unknown.
 * @param translate Translates an English key.
 * @param user_date The ui-kit date formatter.
 * @returns The heading text.
 */
export function format_agenda_date_heading(
  local_date: number | null,
  translate: (key: string) => string,
  user_date: Pick<UserDatePipe, 'transform'>,
): string {
  return local_date === null
    ? translate('Date to be announced')
    : user_date.transform(local_date, DATE_HEADING_FORMAT, DATE_HEADING_TIME_ZONE);
}
