import { IRoutesApp } from '../sync/make_routes_app.fixture.js';
import { IStoredGame } from '../sync/models/stored_game.model.js';
import { make_contract_game } from '../sync/stores/contracts/make_contract_game.js';
import { make_contract_contact } from '../contacts/stores/contracts/make_contract_contact.js';
import { IStoredContact } from '../contacts/models/stored_contact.model.js';
import { IStoredEmailSettings } from '../email_settings/models/stored_email_settings.model.js';

/** One hour in milliseconds. */
export const HOUR = 3_600_000;

/** The sender settings the scenario configures for tenant `t1`. */
export const SCENARIO_SETTINGS: IStoredEmailSettings = {
  api_key: 'SG.scenario-secret-key',
  from_email: 'desk@example.com',
  from_name: 'Metro Referee Desk',
  reply_to: 'reply@example.com',
  postal_address: '1 Main St, Springfield, VA 22150',
};

/**
 * Configures email sending for tenant `t1`.
 * @param context The routes app under test.
 * @param overrides Settings to replace.
 * @returns Resolves when saved.
 */
export async function configure_email(
  context: IRoutesApp,
  overrides: Partial<IStoredEmailSettings> = {},
): Promise<void> {
  await context.email_settings.write('t1', { ...SCENARIO_SETTINGS, ...overrides });
}

/**
 * Seeds one open game of tenant `t1` that starts an hour from now.
 * @param context The routes app under test.
 * @param game_id Primary key of the game.
 * @param overrides Fields to replace.
 * @returns Resolves when stored.
 */
export async function seed_open_game(
  context: IRoutesApp,
  game_id: string,
  overrides: Partial<IStoredGame> = {},
): Promise<void> {
  await context.harness.games.save_games([
    make_contract_game('t1', game_id, {
      start_at: context.harness.clock() + HOUR,
      local_date: Date.UTC(2027, 0, 16),
      level: 'U12',
      home_team: 'Hawks',
      away_team: 'Eagles',
      ...overrides,
    }),
  ]);
}

/**
 * Seeds a consenting contact of tenant `t1`.
 * @param context The routes app under test.
 * @param contact_id Primary key of the contact.
 * @param display_name The contact's name.
 * @param overrides Fields to replace.
 * @returns The contact.
 */
export async function seed_contact(
  context: IRoutesApp,
  contact_id: string,
  display_name: string,
  overrides: Partial<IStoredContact> = {},
): Promise<IStoredContact> {
  const contact = make_contract_contact('t1', contact_id, {
    display_name,
    email_address: `${contact_id}@people.example.com`,
    ...overrides,
  });
  await context.contacts.create_contact(contact);
  return contact;
}

/**
 * Builds a valid draft request body.
 * @param overrides Fields to replace.
 * @returns The body.
 */
export function draft_body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    subject: 'Games this weekend',
    intro: null,
    filters: {},
    include_quick_link: true,
    quick_link_expiry_days: 14,
    recipient_mode: 'ALL_CONSENTED',
    ...overrides,
  };
}

/**
 * Sets up the usual scenario for tenant `t1`: email configured, two open games and three
 * consenting contacts (Ann, Bob and Cyd).
 * @param context The routes app under test.
 * @returns Resolves when everything is seeded.
 */
export async function seed_email_scenario(context: IRoutesApp): Promise<void> {
  await configure_email(context);
  await seed_open_game(context, 'g1');
  await seed_open_game(context, 'g2', { level: 'U14', home_team: 'Lions', away_team: 'Tigers' });
  await seed_contact(context, 'c-ann', 'Ann Archer');
  await seed_contact(context, 'c-bob', 'Bob Baker');
  await seed_contact(context, 'c-cyd', 'Cyd Cook');
}
