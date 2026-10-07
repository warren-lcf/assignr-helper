import { QuickLinkExpiryPreset } from '../enums/quick_link_expiry_preset.enum';
import { ICreateQuickLinkFormModel } from '../models/create_quick_link_form.model';
import { NOW_MS } from '../mocks/quick_link_view.mock';
import { build_create_quick_link_request } from './build_create_quick_link_request';

const BLANK: ICreateQuickLinkFormModel = {
  levels: [],
  date_start: null,
  date_end: null,
  expiry: QuickLinkExpiryPreset.NEVER,
};

const DAY_MS = 86_400_000;

describe('build_create_quick_link_request', () => {
  it('sends "never expires" explicitly, and no scope, for an unrestricted link', () => {
    expect(build_create_quick_link_request(BLANK, NOW_MS)).toEqual({ expires_at: null });
  });

  it('sends cleaned levels', () => {
    expect(
      build_create_quick_link_request({ ...BLANK, levels: [' Premier ', 'premier', ''] }, NOW_MS),
    ).toEqual({ scope: { levels: ['Premier'] }, expires_at: null });
  });

  it('converts picked days to UTC-midnight milliseconds', () => {
    const request = build_create_quick_link_request(
      { ...BLANK, date_start: new Date(2026, 9, 10, 15), date_end: new Date(2026, 9, 20) },
      NOW_MS,
    );

    expect(request).toEqual({
      scope: { date_start: Date.UTC(2026, 9, 10), date_end: Date.UTC(2026, 9, 20) },
      expires_at: null,
    });
  });

  it('sends only the bound that was set', () => {
    expect(
      build_create_quick_link_request({ ...BLANK, date_end: new Date(2026, 9, 20) }, NOW_MS),
    ).toEqual({ scope: { date_end: Date.UTC(2026, 9, 20) }, expires_at: null });
  });

  it.each([
    [QuickLinkExpiryPreset.DAYS_7, 7],
    [QuickLinkExpiryPreset.DAYS_30, 30],
    [QuickLinkExpiryPreset.DAYS_90, 90],
  ])('turns %s into an expiry that many days after now', (expiry, days) => {
    expect(build_create_quick_link_request({ ...BLANK, expiry }, NOW_MS)).toEqual({
      expires_at: NOW_MS + days * DAY_MS,
    });
  });

  it('combines scope and expiry', () => {
    expect(
      build_create_quick_link_request(
        { ...BLANK, levels: ['Select'], expiry: QuickLinkExpiryPreset.DAYS_7 },
        NOW_MS,
      ),
    ).toEqual({ scope: { levels: ['Select'] }, expires_at: NOW_MS + 7 * DAY_MS });
  });

  it('sends a whole number of UTC milliseconds for a date, divisible by a day', () => {
    const request = build_create_quick_link_request(
      { ...BLANK, date_start: new Date(2026, 9, 10, 18, 45), date_end: new Date(2026, 9, 10) },
      NOW_MS,
    );

    expect((request.scope?.date_start ?? 1) % DAY_MS).toBe(0);
    expect((request.scope?.date_end ?? 1) % DAY_MS).toBe(0);
  });

  it('counts from the current time by default', () => {
    const before = Date.now();
    const request = build_create_quick_link_request({
      ...BLANK,
      expiry: QuickLinkExpiryPreset.DAYS_7,
    });

    expect(request.expires_at).toBeGreaterThanOrEqual(before + 7 * DAY_MS);
    expect(request.expires_at).toBeLessThanOrEqual(Date.now() + 7 * DAY_MS);
  });
});
