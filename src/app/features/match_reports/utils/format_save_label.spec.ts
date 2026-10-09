import { SaveState } from '../enums/save_state.enum';
import { format_save_label } from './format_save_label';

const translate = (key: string, params?: Record<string, string | number>): string =>
  params ? key.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name])) : key;

describe('format_save_label', () => {
  it('says Saved and Saving… with no count', () => {
    expect(format_save_label(SaveState.SAVED, 0, translate)).toBe('Saved');
    expect(format_save_label(SaveState.SAVING, 3, translate)).toBe('Saving…');
  });

  it('says how many changes are waiting while offline', () => {
    expect(format_save_label(SaveState.OFFLINE, 3, translate)).toBe('Offline — 3 changes waiting');
  });

  it('uses the singular for one waiting change', () => {
    expect(format_save_label(SaveState.OFFLINE, 1, translate)).toBe('Offline — 1 change waiting');
    expect(format_save_label(SaveState.RETRYING, 1, translate)).toBe(
      'Cannot reach the server — 1 change waiting',
    );
  });

  it('says the server cannot be reached when the device looks online', () => {
    expect(format_save_label(SaveState.RETRYING, 2, translate)).toBe(
      'Cannot reach the server — 2 changes waiting',
    );
  });
});
