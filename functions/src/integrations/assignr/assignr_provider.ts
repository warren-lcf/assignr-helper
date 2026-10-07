import { AssignmentResponseAction } from '../enums/assignment_response_action.enum.js';
import { IntegrationProvider } from '../enums/integration_provider.enum.js';
import { ProviderCapability } from '../enums/provider_capability.enum.js';
import { IAssignmentResponseCommand } from '../models/assignment_response_command.model.js';
import { IGameRequestCommand } from '../models/game_request_command.model.js';
import { INormalizedGame } from '../models/normalized_game.model.js';
import { INormalizedOrganization } from '../models/normalized_organization.model.js';
import { IProviderContext } from '../models/provider_context.model.js';
import { ISyncWindow } from '../models/sync_window.model.js';
import { ISchedulingProvider } from '../ports/scheduling_provider.interface.js';
import { AssignrHttpClient } from './assignr_http_client.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { fetch_all_pages } from './fetch_all_pages.js';
import { format_date_param } from './format_date_param.js';
import { IMapGameOptions } from './mapping/map_game_options.model.js';
import { map_assignr_game } from './mapping/map_assignr_game.js';
import { map_assignr_site } from './mapping/map_assignr_site.js';
import { assignr_user_schema } from './schemas/assignr_user.schema.js';

/** How long a connection's own user ids are reused before being re-read. */
const MY_USER_IDS_TTL_MS = 10 * 60_000;

/** Construction options for the provider. */
export interface IAssignrProviderOptions {
  http_client: AssignrHttpClient;
  now?: () => number;
  /** Called when one record is skipped because it could not be mapped or read. */
  on_skipped?: (external_id: string | null, error: unknown) => void;
}

/**
 * Assignr adapter for the vendor-neutral scheduling port. Endpoint paths and
 * response shapes follow the public docs; the ones flagged in code comments
 * still need verification against a live account.
 */
export class AssignrProvider implements ISchedulingProvider {
  public readonly provider = IntegrationProvider.ASSIGNR;
  public readonly capabilities: ReadonlySet<ProviderCapability> = new Set([
    ProviderCapability.OPEN_GAMES,
    ProviderCapability.ASSIGNMENT_RESPONSE,
    ProviderCapability.GAME_REQUEST,
  ]);

  private readonly http_client: AssignrHttpClient;
  private readonly now: () => number;
  private readonly on_skipped: (external_id: string | null, error: unknown) => void;
  private readonly user_id_cache = new Map<string, { ids: Set<string>; expires_at: number }>();

  public constructor(options: IAssignrProviderOptions) {
    this.http_client = options.http_client;
    this.now = options.now ?? Date.now;
    this.on_skipped =
      options.on_skipped ??
      ((external_id, error) => console.error('Skipped Assignr record', external_id, error));
  }

  /** @inheritdoc */
  public async list_organizations(ctx: IProviderContext): Promise<INormalizedOrganization[]> {
    const token = await ctx.get_access_token();
    const items = await fetch_all_pages(
      this.http_client,
      '/current_account/sites',
      token,
      { 'search[status]': 'active' },
      'sites',
    );
    return this.map_each(items, (item) => map_assignr_site(item));
  }

  /** @inheritdoc */
  public async list_my_games(
    ctx: IProviderContext,
    window: ISyncWindow,
  ): Promise<INormalizedGame[]> {
    const token = await ctx.get_access_token();
    const my_user_ids = await this.my_user_ids(ctx, token);
    const items = await fetch_all_pages(
      this.http_client,
      '/current_account/games',
      token,
      this.window_query(window),
      'games',
    );
    return this.map_each(items, (item) =>
      map_assignr_game(item, {
        my_user_ids,
        fallback_site_id: null,
        assume_mine: true,
        force_open: false,
      }),
    );
  }

  /** @inheritdoc */
  public async list_open_games(
    ctx: IProviderContext,
    window: ISyncWindow,
  ): Promise<INormalizedGame[]> {
    const token = await ctx.get_access_token();
    const my_user_ids = await this.my_user_ids(ctx, token);
    const games: INormalizedGame[] = [];
    for (const organization of await this.list_organizations(ctx)) {
      let items: unknown[];
      try {
        // Verify live: docs also list `/sites/{id}/games/officials/unassigned`.
        items = await fetch_all_pages(
          this.http_client,
          `/sites/${organization.external_id}/games/unassigned`,
          token,
          this.window_query(window),
          'games',
        );
      } catch (error) {
        if (error instanceof AssignrApiError && (error.status === 403 || error.status === 404)) {
          this.on_skipped(organization.external_id, error);
          continue;
        }
        throw error;
      }
      const options: IMapGameOptions = {
        my_user_ids,
        fallback_site_id: organization.external_id,
        assume_mine: false,
        force_open: true,
      };
      games.push(...this.map_each(items, (item) => map_assignr_game(item, options)));
    }
    return games;
  }

  /** @inheritdoc */
  public async get_game(ctx: IProviderContext, game_external_id: string): Promise<INormalizedGame> {
    const token = await ctx.get_access_token();
    const my_user_ids = await this.my_user_ids(ctx, token);
    const body = await this.http_client.get_json(
      `/games/${encodeURIComponent(game_external_id)}`,
      token,
    );
    return map_assignr_game(body, {
      my_user_ids,
      fallback_site_id: null,
      assume_mine: false,
      force_open: null,
    });
  }

  /** @inheritdoc */
  public async respond_to_assignment(
    ctx: IProviderContext,
    command: IAssignmentResponseCommand,
  ): Promise<INormalizedGame> {
    const token = await ctx.get_access_token();
    const accept = command.action === AssignmentResponseAction.ACCEPT;
    const body: Record<string, string> = { status: accept ? 'A' : 'D' };
    if (!accept && command.reason) body['reason'] = command.reason;
    await this.http_client.post_form(
      `/assignments/${encodeURIComponent(command.assignment_external_id)}/confirm`,
      token,
      body,
    );
    return this.get_game(ctx, command.game_external_id);
  }

  /** @inheritdoc */
  public async request_game(
    ctx: IProviderContext,
    command: IGameRequestCommand,
  ): Promise<INormalizedGame> {
    const token = await ctx.get_access_token();
    const body: Record<string, string> = { game_id: command.game_external_id };
    if (command.position_external_id) body['position_id'] = command.position_external_id;
    await this.http_client.post_form('/game_requests', token, body);
    return this.get_game(ctx, command.game_external_id);
  }

  private window_query(window: ISyncWindow): Record<string, string> {
    return {
      'search[start_date]': format_date_param(window.start_at),
      'search[end_date]': format_date_param(window.end_at),
    };
  }

  private map_each<TOut>(items: unknown[], map: (item: unknown) => TOut): TOut[] {
    const mapped: TOut[] = [];
    for (const item of items) {
      try {
        mapped.push(map(item));
      } catch (error) {
        const id = (item as { id?: unknown } | null)?.id;
        this.on_skipped(id === undefined || id === null ? null : String(id), error);
      }
    }
    return mapped;
  }

  private async my_user_ids(ctx: IProviderContext, token: string): Promise<Set<string>> {
    const cached = this.user_id_cache.get(ctx.connection_id);
    if (cached && cached.expires_at > this.now()) return cached.ids;

    const items = await fetch_all_pages(
      this.http_client,
      '/current_account/users',
      token,
      { 'search[status]': 'active' },
      'users',
    );
    const ids = new Set<string>();
    for (const item of items) {
      const parsed = assignr_user_schema.safeParse(item);
      if (parsed.success) ids.add(parsed.data.id);
    }
    this.user_id_cache.set(ctx.connection_id, { ids, expires_at: this.now() + MY_USER_IDS_TTL_MS });
    return ids;
  }
}
