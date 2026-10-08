import { StatusToneEnum } from '@hch-shared-libraries/ui-kit/core';
import { GameSlotState } from '../enums/game_slot_state.enum';
import { IGameSlotView } from '../models/game_slot_view.model';
import { ISlotChip } from '../models/slot_chip.model';

/** Translates an English key. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Open positions come first, then the viewer's own, then filled ones. */
const STATE_ORDER: Record<GameSlotState, number> = {
  [GameSlotState.OPEN]: 0,
  [GameSlotState.MINE]: 1,
  [GameSlotState.FILLED]: 2,
};

/**
 * Turns a game's positions into chips that say which position it is and whether it is open,
 * filled or the viewer's own. Open positions are listed first; positions in the same state keep
 * the order the provider gave them.
 * @param slots The game's positions; absent when the server predates position details.
 * @param translate Translates an English key.
 * @returns One chip per position.
 */
export function build_slot_chips(
  slots: readonly IGameSlotView[] | undefined,
  translate: Translate,
): ISlotChip[] {
  return [...(slots ?? [])]
    .map((slot, index) => ({ slot, index }))
    .sort((a, b) => STATE_ORDER[a.slot.state] - STATE_ORDER[b.slot.state] || a.index - b.index)
    .map(({ slot }): ISlotChip => {
      const position = slot.position.trim() || translate('Position not named');
      switch (slot.state) {
        case GameSlotState.OPEN:
          return {
            label: translate('{{position}}: Open', { position }),
            icon: 'event_seat',
            tone: StatusToneEnum.INFO,
            is_open: true,
          };
        case GameSlotState.MINE:
          return {
            label: translate('{{position}}: Yours', { position }),
            icon: 'person',
            tone: StatusToneEnum.SUCCESS,
            is_open: false,
          };
        default:
          return {
            label: translate('{{position}}: Filled', { position }),
            icon: 'task_alt',
            tone: StatusToneEnum.NEUTRAL,
            is_open: false,
          };
      }
    });
}
