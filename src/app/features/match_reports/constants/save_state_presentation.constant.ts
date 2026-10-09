import { SaveState } from '../enums/save_state.enum';
import { ISaveStatePresentation } from '../models/save_state_presentation.model';

/** Words and icon for each save state. The offline states say how many edits are waiting. */
export const SAVE_STATE_PRESENTATION: Readonly<Record<SaveState, ISaveStatePresentation>> = {
  [SaveState.SAVED]: { label: 'Saved', icon: 'cloud_done' },
  [SaveState.SAVING]: { label: 'Saving…', icon: 'cloud_sync' },
  [SaveState.OFFLINE]: {
    label: 'Offline — {{count}} changes waiting',
    label_one: 'Offline — 1 change waiting',
    icon: 'cloud_off',
  },
  [SaveState.RETRYING]: {
    label: 'Cannot reach the server — {{count}} changes waiting',
    label_one: 'Cannot reach the server — 1 change waiting',
    icon: 'sync_problem',
  },
};
