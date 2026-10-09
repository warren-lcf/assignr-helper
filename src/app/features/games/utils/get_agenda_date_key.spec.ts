import { SATURDAY_DATE } from '../mocks/game_view.mock';
import { get_agenda_date_key } from './get_agenda_date_key';

describe('get_agenda_date_key', () => {
  it('writes a calendar date as its UTC-midnight milliseconds, which carry the year', () => {
    expect(get_agenda_date_key(SATURDAY_DATE)).toBe(String(SATURDAY_DATE));
    expect(get_agenda_date_key(Date.UTC(2027, 9, 10))).not.toBe(get_agenda_date_key(SATURDAY_DATE));
  });

  it('gives games without a date one fixed key that no date can have', () => {
    expect(get_agenda_date_key(null)).toBe('unknown');
    expect(Number.isNaN(Number(get_agenda_date_key(null)))).toBe(true);
  });
});
