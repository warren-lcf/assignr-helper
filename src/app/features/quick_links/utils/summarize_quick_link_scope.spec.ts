import { interpolate_translation_params } from '@hch-shared-libraries/ui-kit/core/translation';
import { IQuickLinkScope } from '../models/quick_link_scope.model';
import { summarize_quick_link_scope } from './summarize_quick_link_scope';

const OPEN_SCOPE: IQuickLinkScope = {
  organization_ids: [],
  levels: [],
  date_start: null,
  date_end: null,
};

const translate = (key: string, params?: Record<string, string | number>) =>
  params ? interpolate_translation_params(key, params) : key;
const format_date = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function summarize(scope: Partial<IQuickLinkScope>): string[] {
  return summarize_quick_link_scope({ ...OPEN_SCOPE, ...scope }, format_date, translate);
}

describe('summarize_quick_link_scope', () => {
  it('says "All levels" and "Any date" for an unrestricted link', () => {
    expect(summarize({})).toEqual(['All levels', 'Any date']);
  });

  it('lists the levels', () => {
    expect(summarize({ levels: ['Premier', 'Select'] })[0]).toBe('Levels: Premier, Select');
  });

  it('describes a closed date window', () => {
    expect(
      summarize({ date_start: Date.UTC(2026, 9, 10), date_end: Date.UTC(2026, 9, 20) })[1],
    ).toBe('2026-10-10 to 2026-10-20');
  });

  it('describes an open-ended start and an open-ended end', () => {
    expect(summarize({ date_start: Date.UTC(2026, 9, 10) })[1]).toBe('From 2026-10-10');
    expect(summarize({ date_end: Date.UTC(2026, 9, 20) })[1]).toBe('Until 2026-10-20');
  });

  it('mentions organization restrictions, singular and plural', () => {
    expect(summarize({ organization_ids: ['a'] })[2]).toBe('1 organization');
    expect(summarize({ organization_ids: ['a', 'b'] })[2]).toBe('2 organizations');
  });
});
