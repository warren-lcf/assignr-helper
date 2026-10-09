import { TestBed } from '@angular/core/testing';
import { USER_DATE_TIMEZONE, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import { SATURDAY_DATE, SUNDAY_DATE } from '../mocks/game_view.mock';
import { format_agenda_date_heading } from './format_agenda_date_heading';

function make_pipe(viewer_zone: string): UserDatePipe {
  TestBed.configureTestingModule({
    providers: [{ provide: USER_DATE_TIMEZONE, useValue: () => viewer_zone }],
  });
  return TestBed.runInInjectionContext(() => new UserDatePipe());
}

describe('format_agenda_date_heading', () => {
  it('writes the weekday, month and day of the calendar date, without the year', () => {
    const pipe = make_pipe('UTC');

    expect(format_agenda_date_heading(SATURDAY_DATE, (key) => key, pipe)).toBe('Saturday, Oct 10');
    expect(format_agenda_date_heading(SUNDAY_DATE, (key) => key, pipe)).toBe('Sunday, Oct 11');
  });

  it('names the same day for a viewer west of UTC, where a viewer-zone date would read a day early', () => {
    const pipe = make_pipe('Pacific/Honolulu');

    expect(format_agenda_date_heading(SATURDAY_DATE, (key) => key, pipe)).toBe('Saturday, Oct 10');
  });

  it('says "Date to be announced", translated, when the date is not known', () => {
    const pipe = make_pipe('UTC');

    expect(format_agenda_date_heading(null, (key) => `[${key}]`, pipe)).toBe(
      '[Date to be announced]',
    );
  });
});
