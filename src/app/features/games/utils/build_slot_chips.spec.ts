import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core';
import { describe, expect, it } from 'vitest';
import { GameSlotState } from '../enums/game_slot_state.enum';
import { build_slot_chips } from './build_slot_chips';

const translate = (key: string, params?: Record<string, string | number>): string =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
    key,
  );

describe('build_slot_chips', () => {
  it('names each position and its state', () => {
    const chips = build_slot_chips(
      [
        { position: 'Referee', state: GameSlotState.OPEN },
        { position: 'Asst. Referee', state: GameSlotState.FILLED },
        { position: 'Mentor', state: GameSlotState.MINE },
      ],
      translate,
    );

    expect(chips.map((chip) => chip.label)).toEqual([
      'Referee: Open',
      'Mentor: Yours',
      'Asst. Referee: Filled',
    ]);
  });

  it('lists open positions first and otherwise keeps the provider order', () => {
    const chips = build_slot_chips(
      [
        { position: 'A', state: GameSlotState.FILLED },
        { position: 'B', state: GameSlotState.OPEN },
        { position: 'C', state: GameSlotState.FILLED },
        { position: 'D', state: GameSlotState.OPEN },
      ],
      translate,
    );

    expect(chips.map((chip) => chip.label)).toEqual([
      'B: Open',
      'D: Open',
      'A: Filled',
      'C: Filled',
    ]);
  });

  it('shows two identical positions as two chips', () => {
    const chips = build_slot_chips(
      [
        { position: 'Asst. Referee', state: GameSlotState.OPEN },
        { position: 'Asst. Referee', state: GameSlotState.OPEN },
      ],
      translate,
    );

    expect(chips).toHaveLength(2);
  });

  it('gives every state an icon as well as words, and marks only open ones as open', () => {
    const chips = build_slot_chips(
      [
        { position: 'R', state: GameSlotState.OPEN },
        { position: 'R', state: GameSlotState.MINE },
        { position: 'R', state: GameSlotState.FILLED },
      ],
      translate,
    );

    expect(chips.map((chip) => chip.icon)).toEqual(['event_seat', 'person', 'task_alt']);
    expect(chips.map((chip) => chip.tone)).toEqual([
      StatusToneEnum.INFO,
      StatusToneEnum.SUCCESS,
      StatusToneEnum.NEUTRAL,
    ]);
    expect(chips.map((chip) => chip.is_open)).toEqual([true, false, false]);
  });

  it('labels a position with no name', () => {
    const [chip] = build_slot_chips([{ position: '  ', state: GameSlotState.OPEN }], translate);

    expect(chip?.label).toBe('Position not named: Open');
  });

  it('returns nothing when the server sent no position details', () => {
    expect(build_slot_chips(undefined, translate)).toEqual([]);
    expect(build_slot_chips([], translate)).toEqual([]);
  });
});
