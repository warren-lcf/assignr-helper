import { IGameGroupLocation } from '../games/game_group_location.model.js';

/** Data needed to render the "games available" digest email. */
export interface IDigestInput {
  /** Greeting line such as a first name; null omits the greeting. */
  recipient_greeting: string | null;
  groups: IGameGroupLocation[];
  /** Live quick-link URL; only `https:` URLs are linked. */
  quick_link_url: string | null;
  unsubscribe_url: string;
  sender_name: string;
  /** Instant the digest was generated, in UTC milliseconds. */
  generated_at: number;
  /** IANA zone used to render start times; null or invalid renders in UTC. */
  time_zone: string | null;
}
