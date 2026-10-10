/** The two facts about how a feed is used, already worded for the screen. */
export interface IFeedActivityText {
  /** When a calendar app last read the feed ("Oct 6, 3:42 PM"), or "Not fetched yet". */
  last_fetched: string;
  /** How many times a calendar app has read the feed, grouped for the viewer's locale. */
  fetch_count: string;
}
