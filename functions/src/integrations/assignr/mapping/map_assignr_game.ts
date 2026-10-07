import { AssignmentResponseStatus } from '../../enums/assignment_response_status.enum.js';
import { GameStatus } from '../../enums/game_status.enum.js';
import { INormalizedGame } from '../../models/normalized_game.model.js';
import { INormalizedGameSlot } from '../../models/normalized_game_slot.model.js';
import { assignr_game_schema, IAssignrGamePayload } from '../schemas/assignr_game.schema.js';
import { IMapGameOptions } from './map_game_options.model.js';
import { map_assignr_venue } from './map_assignr_venue.js';
import { parse_instant } from './parse_instant.js';
import { to_name } from './to_name.js';

type AssignmentPayload = NonNullable<
  NonNullable<IAssignrGamePayload['_embedded']>['assignments']
>[number];

/**
 * Builds one slot from an assignment. An assignment with no embedded official
 * is an unfilled position.
 * @param assignment Parsed assignment.
 * @param my_user_ids The caller's user ids.
 * @returns The normalized slot.
 */
function map_slot(
  assignment: AssignmentPayload,
  my_user_ids: ReadonlySet<string>,
): INormalizedGameSlot {
  const official = assignment._embedded?.official ?? null;
  const full_name = official
    ? `${official.first_name ?? ''} ${official.last_name ?? ''}`.trim()
    : '';
  const assignee_name = official ? full_name || to_name(official.name) : null;
  const response_status = assignment.declined
    ? AssignmentResponseStatus.DECLINED
    : assignment.accepted
      ? AssignmentResponseStatus.ACCEPTED
      : AssignmentResponseStatus.UNRESPONDED;

  return {
    position:
      assignment.position ?? assignment.position_abbreviation ?? assignment.position_id ?? '',
    assignee_name: assignee_name || null,
    assignment_external_id: official ? assignment.id : null,
    response_status,
    is_mine: Boolean(official?.id && my_user_ids.has(official.id)),
    lock_version: assignment.lock_version ?? null,
    fees: assignment._embedded?.fees ?? [],
  };
}

/**
 * Maps an Assignr game payload to the vendor-neutral game.
 * @param payload Raw game object from a list or detail response.
 * @param options Mapping context.
 * @returns The normalized game.
 * @throws ZodError when the payload does not match the expected shape, or Error when the start time is unusable.
 */
export function map_assignr_game(payload: unknown, options: IMapGameOptions): INormalizedGame {
  const game = assignr_game_schema.parse(payload);
  const start_at = parse_instant(game.start_time);
  if (start_at === null) {
    throw new Error(`Game ${game.id} has an unparseable start_time`);
  }

  const venue = game._embedded?.venue ? map_assignr_venue(game._embedded.venue) : null;
  const slots = (game._embedded?.assignments ?? []).map((assignment) =>
    map_slot(assignment, options.my_user_ids),
  );
  const cancelled = Boolean(game.cancelled) || game.status?.toLowerCase() === 'cancelled';
  const has_unfilled_slot = slots.some((slot) => slot.assignment_external_id === null);

  return {
    external_id: game.id,
    organization_external_id: game._embedded?.site?.id ?? options.fallback_site_id ?? '',
    venue,
    start_at,
    end_at: parse_instant(game.end_time),
    game_time_zone: game.game_time_zone ?? game.time_zone ?? venue?.time_zone ?? null,
    status: cancelled ? GameStatus.CANCELLED : GameStatus.SCHEDULED,
    published: game.published ?? true,
    league: to_name(game.league),
    age_group: to_name(game.age_group),
    level: null,
    game_type: to_name(game.game_type),
    gender: to_name(game.gender),
    home_team: to_name(game.home_team),
    away_team: to_name(game.away_team),
    is_open: !cancelled && (options.force_open ?? has_unfilled_slot),
    is_mine: options.assume_mine || slots.some((slot) => slot.is_mine),
    slots,
    external_updated_at: parse_instant(game.updated),
    lock_version: game.lock_version ?? null,
    raw: payload as Record<string, unknown>,
  };
}
