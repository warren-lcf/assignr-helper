import { ReadyBlocker } from './ready_blocker.enum.js';

/** Whether a report can be marked READY, and if not, why. */
export interface IReadyCheck {
  ready: boolean;
  blockers: ReadyBlocker[];
}
