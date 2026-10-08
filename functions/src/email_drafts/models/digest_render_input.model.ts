import { IDraftContent } from './draft_content.model.js';
import { ILoadedDigestGames } from './loaded_digest_games.model.js';

/** Everything that goes into one rendered email. */
export interface IDigestRenderInput {
  /** The draft whose subject and intro are used. */
  content: Pick<IDraftContent, 'subject' | 'intro'>;
  games: ILoadedDigestGames;
  /** Name printed in the sign-off; null uses the standard one. */
  sender_name: string | null;
  postal_address: string | null;
  /** Greeting line for the recipient; null prints none. */
  recipient_greeting: string | null;
  /** Absolute URL of the live list; null leaves the button out. */
  quick_link_url: string | null;
  unsubscribe_url: string;
}
