import { make_translation_service_double } from '../mocks/translation_service.mock';
import { format_open_slots } from './format_open_slots';

const translate = make_translation_service_double().translate;

describe('format_open_slots', () => {
  it('says how many of the slots are open', () => {
    expect(format_open_slots({ open_slot_count: 2, total_slot_count: 3 }, translate)).toBe(
      '2 open of 3 slots',
    );
    expect(format_open_slots({ open_slot_count: 0, total_slot_count: 3 }, translate)).toBe(
      '0 open of 3 slots',
    );
  });

  it('uses the singular for a single slot', () => {
    expect(format_open_slots({ open_slot_count: 1, total_slot_count: 1 }, translate)).toBe(
      '1 open of 1 slot',
    );
  });

  it('says so when the game lists no slots', () => {
    expect(format_open_slots({ open_slot_count: 0, total_slot_count: 0 }, translate)).toBe(
      'No slots listed',
    );
  });
});
