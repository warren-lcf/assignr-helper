import { IntegrationProvider } from '../enums/integration_provider.enum.js';
import { ProviderCapability } from '../enums/provider_capability.enum.js';
import { IAssignmentResponseCommand } from '../models/assignment_response_command.model.js';
import { IGameRequestCommand } from '../models/game_request_command.model.js';
import { INormalizedGame } from '../models/normalized_game.model.js';
import { INormalizedOrganization } from '../models/normalized_organization.model.js';
import { IProviderContext } from '../models/provider_context.model.js';
import { ISyncWindow } from '../models/sync_window.model.js';

/**
 * Vendor-neutral contract every scheduling integration implements. Services
 * depend on this port only; vendor specifics live in the adapter behind it.
 */
export interface ISchedulingProvider {
  /** Which vendor this adapter speaks to. */
  readonly provider: IntegrationProvider;

  /** Optional features this provider supports. */
  readonly capabilities: ReadonlySet<ProviderCapability>;

  /**
   * Lists the organizations (assignor sites) the connected account belongs to.
   * @param ctx Per-call provider context.
   * @returns Organizations visible to the account.
   */
  list_organizations(ctx: IProviderContext): Promise<INormalizedOrganization[]>;

  /**
   * Lists open (unassigned) games inside the window, paging internally and
   * honouring the provider's rate budget.
   * @param ctx Per-call provider context.
   * @param window Date window to pull.
   * @returns Open games in the window.
   */
  list_open_games(ctx: IProviderContext, window: ISyncWindow): Promise<INormalizedGame[]>;

  /**
   * Lists games assigned to the connected account inside the window.
   * @param ctx Per-call provider context.
   * @param window Date window to pull.
   * @returns The account's games in the window.
   */
  list_my_games(ctx: IProviderContext, window: ISyncWindow): Promise<INormalizedGame[]>;

  /**
   * Fetches one game live, bypassing the local copy.
   * @param ctx Per-call provider context.
   * @param game_external_id Provider game id.
   * @returns The current game.
   */
  get_game(ctx: IProviderContext, game_external_id: string): Promise<INormalizedGame>;

  /**
   * Accepts or declines an assignment.
   * @param ctx Per-call provider context.
   * @param command The response to record.
   * @returns The game as the provider now reports it.
   */
  respond_to_assignment(
    ctx: IProviderContext,
    command: IAssignmentResponseCommand,
  ): Promise<INormalizedGame>;

  /**
   * Requests (claims) an open game.
   * @param ctx Per-call provider context.
   * @param command The request to place.
   * @returns The game as the provider now reports it.
   */
  request_game(ctx: IProviderContext, command: IGameRequestCommand): Promise<INormalizedGame>;
}
