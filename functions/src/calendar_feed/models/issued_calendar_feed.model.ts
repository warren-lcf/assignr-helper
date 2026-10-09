import { IStoredCalendarFeed } from './stored_calendar_feed.model.js';

/** The result of creating or rotating a feed: the row and the one and only sight of its token. */
export interface IIssuedCalendarFeed {
  feed: IStoredCalendarFeed;
  /** The plaintext token. Show it once; only its hash is stored. */
  token: string;
}
