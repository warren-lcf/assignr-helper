import { TestBed } from '@angular/core/testing';
import { USER_DATE_TIMEZONE, UserDatePipe } from '@hch-shared-libraries/ui-kit/core';
import {
  BARE_GAME,
  MINE_GAME,
  OPEN_GAME,
  SATURDAY_DATE,
  make_game_view,
} from '../mocks/game_view.mock';
import { build_agenda_date_level } from './build_agenda_date_level';

function make_level(translate: (key: string) => string = (key) => key) {
  TestBed.configureTestingModule({
    providers: [{ provide: USER_DATE_TIMEZONE, useValue: () => 'UTC' }],
  });
  const user_date = TestBed.runInInjectionContext(() => new UserDatePipe());
  return build_agenda_date_level(translate, user_date);
}

describe('build_agenda_date_level', () => {
  it('keys a game by its calendar date in UTC milliseconds, so one day is one group', () => {
    const level = make_level();

    expect(level.get_key(OPEN_GAME)).toBe(String(SATURDAY_DATE));
    expect(level.get_key(MINE_GAME)).toBe(level.get_key(OPEN_GAME));
  });

  it('keeps the same day a year apart in two groups', () => {
    const level = make_level();
    const next_year = make_game_view({ local_date: Date.UTC(2027, 9, 10) });

    expect(level.get_key(next_year)).not.toBe(level.get_key(OPEN_GAME));
  });

  it('gives games without a date one fixed key', () => {
    expect(make_level().get_key(BARE_GAME)).toBe('unknown');
  });

  it('heads a group with the weekday and date of its first game', () => {
    const level = make_level();

    expect(level.get_label('ignored', OPEN_GAME)).toBe('Saturday, Oct 10');
  });

  it('heads games without a date with the translated placeholder', () => {
    const level = make_level((key) => `[${key}]`);

    expect(level.get_label('unknown', BARE_GAME)).toBe('[Date to be announced]');
  });
});
