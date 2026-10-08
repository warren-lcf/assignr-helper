import { describe, expect, it } from 'vitest';
import { make_game_view } from '../../../domain/games/make_game_view.fixture.js';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { BeginSendOutcome } from '../../enums/begin_send_outcome.enum.js';
import { DeleteDraftOutcome } from '../../enums/delete_draft_outcome.enum.js';
import { DraftStatus } from '../../enums/draft_status.enum.js';
import { DraftWriteOutcome } from '../../enums/draft_write_outcome.enum.js';
import { RecipientMode } from '../../enums/recipient_mode.enum.js';
import { IDraftContent } from '../../models/draft_content.model.js';
import { IEmailDraftStore } from '../../ports/email_draft_store.interface.js';
import { make_contract_draft, make_contract_filters } from './make_contract_draft.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

const STALE_AFTER_MS = 600_000;

/**
 * Builds new content that differs from a fresh draft in every field.
 * @returns Content to write.
 */
function other_content(): IDraftContent {
  return {
    subject: 'New subject "quoted", with é',
    intro: 'Line one\nLine two',
    filters: make_contract_filters({
      search: 'cup',
      level: 'U12',
      league: 'Spring',
      age_group: 'U12',
      location_group: 'Field Complex',
      organization_id: 'org-9',
      connection_id: 'conn-2',
      only_with_open_slots: true,
      date_from: 1786234970000,
      date_to: 1786834970000,
    }),
    include_quick_link: false,
    quick_link_expiry_days: 30,
    recipient_mode: RecipientMode.SELECTED,
    contact_ids: ['c1', 'c2'],
  };
}

/**
 * Registers the behavioural contract every `IEmailDraftStore` must satisfy. Each test works in
 * fresh random tenants, so it neither assumes an empty store nor touches other tenants' rows.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_email_draft_store_contract(
  label: string,
  make: () => IEmailDraftStore,
): void {
  describe(`${label} email draft store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    describe('create_draft, get_draft and list_drafts', () => {
      it('round-trips every field', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const draft = make_contract_draft(tenant_id, 'd1', {
          ...other_content(),
          status: DraftStatus.PARTIALLY_SENT,
          quick_link_id: 'ql-1',
          recipient_count: 7,
          sent_at: 1786234980000,
          created_at: 1786234960000,
          updated_at: 1786234990000,
          updated_by: 'someone',
        });

        await store.create_draft(draft);

        expect(await store.get_draft(tenant_id, 'd1')).toEqual(draft);
      });

      it('round-trips an empty draft', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const draft = make_contract_draft(tenant_id, 'd1');

        await store.create_draft(draft);

        expect(await store.get_draft(tenant_id, 'd1')).toEqual(draft);
      });

      it('refuses a second draft with the same id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));

        await expect(store.create_draft(make_contract_draft(tenant_id, 'd1'))).rejects.toThrow();
      });

      it('does not show another tenant a draft', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));

        expect(await store.get_draft(tenant_b, 'd1')).toBeNull();
        expect(await store.list_drafts(tenant_b, 100)).toEqual([]);
      });

      it('lists newest first with the limit applied', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1', { created_at: 1000 }));
        await store.create_draft(make_contract_draft(tenant_id, 'd2', { created_at: 3000 }));
        await store.create_draft(make_contract_draft(tenant_id, 'd3', { created_at: 3000 }));
        await store.create_draft(make_contract_draft(tenant_id, 'd4', { created_at: 2000 }));

        const all = await store.list_drafts(tenant_id, 100);
        const two = await store.list_drafts(tenant_id, 2);

        expect(all.map((draft) => draft.draft_id)).toEqual(['d3', 'd2', 'd4', 'd1']);
        expect(two.map((draft) => draft.draft_id)).toEqual(['d3', 'd2']);
      });

      it('does not let a caller change stored values through a returned object', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(
          make_contract_draft(tenant_id, 'd1', {
            filters: make_contract_filters({ search: 'x' }),
            contact_ids: ['c1'],
          }),
        );

        const first = await store.get_draft(tenant_id, 'd1');
        if (first) {
          first.subject = 'tampered';
          first.contact_ids.push('c9');
          first.filters.search = 'tampered';
        }

        const again = await store.get_draft(tenant_id, 'd1');
        expect(again?.subject).toBe('Games d1');
        expect(again?.contact_ids).toEqual(['c1']);
        expect(again?.filters.search).toBe('x');
      });
    });

    describe('update_draft', () => {
      it('replaces the content, stamps the change and moves the version forward', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const draft = make_contract_draft(tenant_id, 'd1');
        await store.create_draft(draft);

        const result = await store.update_draft(
          tenant_id,
          'd1',
          draft.updated_at,
          other_content(),
          5000,
          'editor',
        );

        expect(result.outcome).toBe(DraftWriteOutcome.UPDATED);
        expect(result.draft).toEqual({
          ...draft,
          ...other_content(),
          updated_at: 5000,
          updated_by: 'editor',
        });
        expect(await store.get_draft(tenant_id, 'd1')).toEqual(result.draft);
      });

      it('moves the version strictly forward even when the clock has not', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1', { updated_at: 5000 }));

        const first = await store.update_draft(tenant_id, 'd1', 5000, other_content(), 5000, 'a');
        const second = await store.update_draft(
          tenant_id,
          'd1',
          first.draft?.updated_at ?? 0,
          other_content(),
          100,
          'a',
        );

        expect(first.draft?.updated_at).toBe(5001);
        expect(second.draft?.updated_at).toBe(5002);
      });

      it('reports STALE and changes nothing when the draft moved since it was read', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const draft = make_contract_draft(tenant_id, 'd1');
        await store.create_draft(draft);

        const result = await store.update_draft(tenant_id, 'd1', 999, other_content(), 5000, 'a');

        expect(result.outcome).toBe(DraftWriteOutcome.STALE);
        expect(await store.get_draft(tenant_id, 'd1')).toEqual(draft);
      });

      it('lets exactly one of several simultaneous writers holding the same version win', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));

        const results = await Promise.all(
          [1, 2, 3, 4].map((n) =>
            store.update_draft(
              tenant_id,
              'd1',
              1000,
              { ...other_content(), subject: `writer ${n}` },
              5000 + n,
              `w${n}`,
            ),
          ),
        );

        expect(results.filter((r) => r.outcome === DraftWriteOutcome.UPDATED)).toHaveLength(1);
        expect(results.filter((r) => r.outcome === DraftWriteOutcome.STALE)).toHaveLength(3);
      });

      it('reports NOT_DRAFT once a send has started', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.begin_send(tenant_id, 'd1', 2000, 'a', STALE_AFTER_MS);

        const result = await store.update_draft(tenant_id, 'd1', 2000, other_content(), 5000, 'a');

        expect(result.outcome).toBe(DraftWriteOutcome.NOT_DRAFT);
        expect((await store.get_draft(tenant_id, 'd1'))?.subject).toBe('Games d1');
      });

      it('reports NOT_FOUND for an unknown draft and for another tenant draft', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));

        expect(
          (await store.update_draft(tenant_a, 'nope', 1000, other_content(), 1, 'a')).outcome,
        ).toBe(DraftWriteOutcome.NOT_FOUND);
        expect(
          (await store.update_draft(tenant_b, 'd1', 1000, other_content(), 1, 'a')).outcome,
        ).toBe(DraftWriteOutcome.NOT_FOUND);
        expect((await store.get_draft(tenant_a, 'd1'))?.subject).toBe('Games d1');
      });
    });

    describe('delete_draft', () => {
      it('deletes a draft that was never sent, with its recorded games', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.replace_draft_games(
          tenant_id,
          'd1',
          [{ game_id: 'g1', game: make_game_view({ game_id: 'g1' }) }],
          1000,
          'a',
        );

        expect(await store.delete_draft(tenant_id, 'd1')).toBe(DeleteDraftOutcome.DELETED);

        expect(await store.get_draft(tenant_id, 'd1')).toBeNull();
        expect(await store.list_draft_games(tenant_id, 'd1')).toEqual([]);
        expect(await store.delete_draft(tenant_id, 'd1')).toBe(DeleteDraftOutcome.NOT_FOUND);
      });

      it.each([DraftStatus.SENDING, DraftStatus.SENT, DraftStatus.PARTIALLY_SENT])(
        'refuses to delete a %s draft',
        async (status) => {
          const store = make();
          const tenant_id = make_contract_tenant_id();
          await store.create_draft(make_contract_draft(tenant_id, 'd1', { status }));

          expect(await store.delete_draft(tenant_id, 'd1')).toBe(DeleteDraftOutcome.NOT_DRAFT);

          expect(await store.get_draft(tenant_id, 'd1')).not.toBeNull();
        },
      );

      it('does not delete another tenant draft', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));

        expect(await store.delete_draft(tenant_b, 'd1')).toBe(DeleteDraftOutcome.NOT_FOUND);

        expect(await store.get_draft(tenant_a, 'd1')).not.toBeNull();
      });
    });

    describe('begin_send', () => {
      it('locks a DRAFT as SENDING and tells how to put it back', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));

        const result = await store.begin_send(tenant_id, 'd1', 5000, 'sender', STALE_AFTER_MS);

        expect(result.outcome).toBe(BeginSendOutcome.STARTED);
        expect(result.revert_to).toBe(DraftStatus.DRAFT);
        expect(result.draft).toMatchObject({
          status: DraftStatus.SENDING,
          updated_at: 5000,
          updated_by: 'sender',
        });
        expect((await store.get_draft(tenant_id, 'd1'))?.status).toBe(DraftStatus.SENDING);
      });

      it('locks a PARTIALLY_SENT draft for a retry', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(
          make_contract_draft(tenant_id, 'd1', { status: DraftStatus.PARTIALLY_SENT }),
        );

        const result = await store.begin_send(tenant_id, 'd1', 5000, 'sender', STALE_AFTER_MS);

        expect(result.outcome).toBe(BeginSendOutcome.STARTED);
        expect(result.revert_to).toBe(DraftStatus.PARTIALLY_SENT);
      });

      it('lets a second caller see NOT_SENDABLE while the first holds the lock', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.begin_send(tenant_id, 'd1', 5000, 'first', STALE_AFTER_MS);

        const second = await store.begin_send(tenant_id, 'd1', 6000, 'second', STALE_AFTER_MS);

        expect(second.outcome).toBe(BeginSendOutcome.NOT_SENDABLE);
        expect((await store.get_draft(tenant_id, 'd1'))?.updated_by).toBe('first');
      });

      it('lets exactly one of several simultaneous callers take the lock', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));

        const results = await Promise.all(
          [1, 2, 3, 4, 5].map((n) =>
            store.begin_send(tenant_id, 'd1', 5000 + n, `s${n}`, STALE_AFTER_MS),
          ),
        );

        expect(results.filter((r) => r.outcome === BeginSendOutcome.STARTED)).toHaveLength(1);
        expect(results.filter((r) => r.outcome === BeginSendOutcome.NOT_SENDABLE)).toHaveLength(4);
      });

      it('refuses a draft that has been fully sent', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(
          make_contract_draft(tenant_id, 'd1', { status: DraftStatus.SENT }),
        );

        const result = await store.begin_send(tenant_id, 'd1', 5000, 'a', STALE_AFTER_MS);

        expect(result.outcome).toBe(BeginSendOutcome.NOT_SENDABLE);
      });

      it('takes over a lock that has stood longer than the stale limit, reverting to PARTIALLY_SENT', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.begin_send(tenant_id, 'd1', 5000, 'dead', STALE_AFTER_MS);

        const too_soon = await store.begin_send(
          tenant_id,
          'd1',
          5000 + STALE_AFTER_MS - 1,
          'x',
          STALE_AFTER_MS,
        );
        const takeover = await store.begin_send(
          tenant_id,
          'd1',
          5000 + STALE_AFTER_MS,
          'new',
          STALE_AFTER_MS,
        );

        expect(too_soon.outcome).toBe(BeginSendOutcome.NOT_SENDABLE);
        expect(takeover.outcome).toBe(BeginSendOutcome.STARTED);
        expect(takeover.revert_to).toBe(DraftStatus.PARTIALLY_SENT);
        expect(takeover.draft?.updated_by).toBe('new');
      });

      it('reports NOT_FOUND for an unknown draft and another tenant draft', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));

        expect((await store.begin_send(tenant_a, 'nope', 1, 'a', 1)).outcome).toBe(
          BeginSendOutcome.NOT_FOUND,
        );
        expect((await store.begin_send(tenant_b, 'd1', 1, 'a', 1)).outcome).toBe(
          BeginSendOutcome.NOT_FOUND,
        );
        expect((await store.get_draft(tenant_a, 'd1'))?.status).toBe(DraftStatus.DRAFT);
      });
    });

    describe('finish_send and revert_send', () => {
      it('records the outcome of a send on a SENDING draft', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.begin_send(tenant_id, 'd1', 5000, 'a', STALE_AFTER_MS);

        const finished = await store.finish_send(
          tenant_id,
          'd1',
          { status: DraftStatus.SENT, recipient_count: 4, quick_link_id: 'ql-9', sent_at: 7000 },
          8000,
          'a',
        );

        expect(finished).toMatchObject({
          status: DraftStatus.SENT,
          recipient_count: 4,
          quick_link_id: 'ql-9',
          sent_at: 7000,
          updated_at: 8000,
        });
        expect(await store.get_draft(tenant_id, 'd1')).toEqual(finished);
      });

      it('keeps the earlier quick link and send time when the new ones are null', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(
          make_contract_draft(tenant_id, 'd1', {
            status: DraftStatus.PARTIALLY_SENT,
            quick_link_id: 'ql-old',
            sent_at: 3000,
            recipient_count: 2,
          }),
        );
        await store.begin_send(tenant_id, 'd1', 5000, 'a', STALE_AFTER_MS);

        const finished = await store.finish_send(
          tenant_id,
          'd1',
          {
            status: DraftStatus.PARTIALLY_SENT,
            recipient_count: 2,
            quick_link_id: null,
            sent_at: null,
          },
          8000,
          'a',
        );

        expect(finished).toMatchObject({ quick_link_id: 'ql-old', sent_at: 3000 });
      });

      it('changes nothing when the draft is not SENDING', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        const draft = make_contract_draft(tenant_id, 'd1');
        await store.create_draft(draft);

        const finished = await store.finish_send(
          tenant_id,
          'd1',
          { status: DraftStatus.SENT, recipient_count: 1, quick_link_id: null, sent_at: 1 },
          8000,
          'a',
        );
        const reverted = await store.revert_send(tenant_id, 'd1', DraftStatus.DRAFT, 8000, 'a');

        expect(finished).toBeNull();
        expect(reverted).toBeNull();
        expect(await store.get_draft(tenant_id, 'd1')).toEqual(draft);
      });

      it('puts an abandoned send back where it was', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        const began = await store.begin_send(tenant_id, 'd1', 5000, 'a', STALE_AFTER_MS);

        const reverted = await store.revert_send(
          tenant_id,
          'd1',
          began.revert_to as DraftStatus.DRAFT,
          6000,
          'a',
        );

        expect(reverted?.status).toBe(DraftStatus.DRAFT);
        expect((await store.begin_send(tenant_id, 'd1', 7000, 'b', STALE_AFTER_MS)).outcome).toBe(
          BeginSendOutcome.STARTED,
        );
      });

      it('does not touch another tenant draft', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));
        await store.begin_send(tenant_a, 'd1', 5000, 'a', STALE_AFTER_MS);

        expect(
          await store.finish_send(
            tenant_b,
            'd1',
            { status: DraftStatus.SENT, recipient_count: 1, quick_link_id: null, sent_at: 1 },
            8000,
            'x',
          ),
        ).toBeNull();
        expect(await store.revert_send(tenant_b, 'd1', DraftStatus.DRAFT, 8000, 'x')).toBeNull();
        expect((await store.get_draft(tenant_a, 'd1'))?.status).toBe(DraftStatus.SENDING);
      });
    });

    describe('replace_draft_games and list_draft_games', () => {
      it('round-trips the games and orders them by game id', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        const g2 = make_game_view({ game_id: 'g2', home_team: 'Hawks "A"', level: 'U12, Girls' });
        const g1 = make_game_view({ game_id: 'g1', venue_name: 'Field Ü' });

        await store.replace_draft_games(
          tenant_id,
          'd1',
          [
            { game_id: 'g2', game: g2 },
            { game_id: 'g1', game: g1 },
          ],
          1000,
          'a',
        );

        expect(await store.list_draft_games(tenant_id, 'd1')).toEqual([
          { game_id: 'g1', game: g1 },
          { game_id: 'g2', game: g2 },
        ]);
      });

      it('replaces the earlier games as a whole', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.replace_draft_games(
          tenant_id,
          'd1',
          [
            { game_id: 'g1', game: make_game_view({ game_id: 'g1' }) },
            { game_id: 'g2', game: make_game_view({ game_id: 'g2' }) },
          ],
          1000,
          'a',
        );

        await store.replace_draft_games(
          tenant_id,
          'd1',
          [{ game_id: 'g3', game: make_game_view({ game_id: 'g3' }) }],
          2000,
          'a',
        );

        const games = await store.list_draft_games(tenant_id, 'd1');
        expect(games.map((snapshot) => snapshot.game_id)).toEqual(['g3']);
      });

      it('can clear the games with an empty list', async () => {
        const store = make();
        const tenant_id = make_contract_tenant_id();
        await store.create_draft(make_contract_draft(tenant_id, 'd1'));
        await store.replace_draft_games(
          tenant_id,
          'd1',
          [{ game_id: 'g1', game: make_game_view({ game_id: 'g1' }) }],
          1000,
          'a',
        );

        await store.replace_draft_games(tenant_id, 'd1', [], 2000, 'a');

        expect(await store.list_draft_games(tenant_id, 'd1')).toEqual([]);
      });

      it('keeps drafts and tenants apart', async () => {
        const store = make();
        const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
        await store.create_draft(make_contract_draft(tenant_a, 'd1'));
        await store.create_draft(make_contract_draft(tenant_a, 'd2'));
        await store.replace_draft_games(
          tenant_a,
          'd1',
          [{ game_id: 'g1', game: make_game_view({ game_id: 'g1' }) }],
          1000,
          'a',
        );

        expect(await store.list_draft_games(tenant_a, 'd2')).toEqual([]);
        expect(await store.list_draft_games(tenant_b, 'd1')).toEqual([]);
      });
    });
  });
}
