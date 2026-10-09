import { UserDateFormat } from '@hch-shared-libraries/ui-kit/core';

/**
 * How a date heading in a games list is written: the weekday, month and day ("Saturday, Oct 10").
 * The year is left out by the format itself.
 */
export const DATE_HEADING_FORMAT = UserDateFormat.WEEKDAY_DATE;

/**
 * The zone a date heading is formatted in. A game's `local_date` is a calendar date stored as UTC
 * midnight (the day it is on the venue's clock), so formatting it in UTC names that same day in every
 * viewer's zone; any other zone could name the day before.
 */
export const DATE_HEADING_TIME_ZONE = 'UTC';
