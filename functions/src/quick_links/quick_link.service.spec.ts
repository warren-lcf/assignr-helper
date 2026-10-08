import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it } from 'vitest';
import { hash_quick_link_token } from '../domain/quick_links/hash_quick_link_token.js';
import { QuickLinkState } from '../domain/quick_links/quick_link_state.enum.js';
import { QuickLinkNotFoundError } from './errors/quick_link_not_found.error.js';
import { ICreateQuickLinkInput } from './models/create_quick_link_input.model.js';
import { IQuickLinkActor } from './models/quick_link_actor.model.js';
import { QUICK_LINK_AUDIT_RESOURCE, QuickLinkService } from './quick_link.service.js';
import { InMemoryQuickLinkStore } from './stores/in_memory_quick_link_store.js';

const ACTOR: IQuickLinkActor = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'PLATFORM_ADMIN',
  effective_role: 'TENANT_OWNER',
};
const INPUT: ICreateQuickLinkInput = {
  scope: { organization_ids: ['org-1'], levels: ['U12'], date_start: null, date_end: null },
  expires_at: 9_000_000,
};
const TOKEN = 'T'.repeat(43);

/**
 * Builds the service over in-memory parts and a clock that advances one second per reading.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const quick_links = new InMemoryQuickLinkStore();
  const audit_store = create_in_memory_audit_log_store();
  let counter = 0;
  let clock = 1000;
  let tokens = 0;
  const service = new QuickLinkService({
    quick_links,
    audit: create_audit_log_service({ store: audit_store, now: () => 5000 }),
    now: () => (clock += 1000),
    generate_id: () => `ql-${++counter}`,
    generate_token: () => (tokens++ === 0 ? TOKEN : `${'U'.repeat(42)}${tokens}`),
  });
  return { service, quick_links, audit_store };
}

describe('QuickLinkService.create_link', () => {
  it('stores only the token hash, returns the token once, and stamps the actor', async () => {
    const { service, quick_links } = make_service();

    const created = await service.create_link(ACTOR, INPUT);

    expect(created.token).toBe(TOKEN);
    expect(created.link).toMatchObject({
      tenant_id: 't1',
      link_id: 'ql-1',
      token_hash: hash_quick_link_token(TOKEN),
      scope: INPUT.scope,
      expires_at: 9_000_000,
      revoked_at: null,
      last_viewed_at: null,
      view_count: 0,
      email_draft_id: null,
      created_by: 'u-owner',
      updated_by: 'u-owner',
    });
    expect(created.link.created_at).toBe(created.link.updated_at);
    const stored = await quick_links.get_link('t1', 'ql-1');
    expect(stored).toEqual(created.link);
    expect(JSON.stringify(stored)).not.toContain(TOKEN);
  });

  it('records the email draft it was created for', async () => {
    const { service, quick_links } = make_service();

    const created = await service.create_link(ACTOR, { ...INPUT, email_draft_id: 'draft-7' });

    expect(created.link.email_draft_id).toBe('draft-7');
    expect((await quick_links.get_link('t1', 'ql-1'))?.email_draft_id).toBe('draft-7');
  });

  it('can be opened later by the hash of its token', async () => {
    const { service, quick_links } = make_service();
    const created = await service.create_link(ACTOR, INPUT);

    const found = await quick_links.find_by_token_hash(hash_quick_link_token(created.token));

    expect(found?.link_id).toBe('ql-1');
  });

  it('uses a fresh random token each time by default', async () => {
    const quick_links = new InMemoryQuickLinkStore();
    const service = new QuickLinkService({
      quick_links,
      audit: create_audit_log_service({ store: create_in_memory_audit_log_store() }),
      now: () => 1000,
      generate_id: (() => {
        let n = 0;
        return () => `id-${++n}`;
      })(),
    });

    const first = await service.create_link(ACTOR, INPUT);
    const second = await service.create_link(ACTOR, INPUT);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
  });

  it('copies the scope so later changes to the input do not reach the stored link', async () => {
    const { service, quick_links } = make_service();
    const input: ICreateQuickLinkInput = structuredClone(INPUT);

    await service.create_link(ACTOR, input);
    input.scope.levels.push('mutated');

    expect((await quick_links.get_link('t1', 'ql-1'))?.scope.levels).toEqual(['U12']);
  });

  it('writes one audit row with both roles, the allow-listed state, and no token or hash', async () => {
    const { service, audit_store } = make_service();

    const created = await service.create_link(ACTOR, INPUT);

    expect(audit_store.rows).toHaveLength(1);
    const row = audit_store.rows[0]!;
    expect(row).toMatchObject({
      user_id: 'u-owner',
      tenant_id: 't1',
      resource_type: QUICK_LINK_AUDIT_RESOURCE,
      resource_id: 'ql-1',
      action: 'CREATE',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.parse(String(row.after_state_json))).toEqual({
      link_id: 'ql-1',
      state: QuickLinkState.ACTIVE,
      scope: INPUT.scope,
      expires_at: 9_000_000,
      revoked_at: null,
    });
    const serialized = JSON.stringify(audit_store.rows);
    expect(serialized).not.toContain(created.token);
    expect(serialized).not.toContain(created.link.token_hash);
    expect(serialized).not.toContain('token');
  });

  it('does not report success when the store refuses the link, and writes no audit row', async () => {
    const { service, quick_links, audit_store } = make_service();
    quick_links.create_link = async () => {
      throw new Error('store down');
    };

    await expect(service.create_link(ACTOR, INPUT)).rejects.toThrow('store down');
    expect(audit_store.rows).toHaveLength(0);
  });
});

describe('QuickLinkService.list_links', () => {
  it("lists the tenant's links newest first", async () => {
    const { service } = make_service();
    await service.create_link(ACTOR, INPUT);
    await service.create_link(ACTOR, INPUT);
    await service.create_link({ ...ACTOR, tenant_id: 't2' }, INPUT);

    const links = await service.list_links('t1');

    expect(links.map((link) => link.link_id)).toEqual(['ql-2', 'ql-1']);
  });
});

describe('QuickLinkService.revoke_link', () => {
  it('revokes, stamps the actor, and audits the change from active to revoked', async () => {
    const { service, audit_store } = make_service();
    await service.create_link(ACTOR, INPUT);

    const revoked = await service.revoke_link({ ...ACTOR, user_id: 'u-other' }, 'ql-1');

    expect(revoked.revoked_at).not.toBeNull();
    expect(revoked.updated_by).toBe('u-other');
    expect(audit_store.rows).toHaveLength(2);
    const row = audit_store.rows[1]!;
    expect(row).toMatchObject({
      user_id: 'u-other',
      resource_id: 'ql-1',
      action: 'UPDATE',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.parse(String(row.before_state_json))).toMatchObject({
      state: QuickLinkState.ACTIVE,
      revoked_at: null,
    });
    expect(JSON.parse(String(row.after_state_json))).toMatchObject({
      link_id: 'ql-1',
      state: QuickLinkState.REVOKED,
      revoked_at: revoked.revoked_at,
    });
    expect(JSON.stringify(audit_store.rows)).not.toContain(revoked.token_hash);
  });

  it('is idempotent: revoking again changes nothing and writes no second audit row', async () => {
    const { service, audit_store } = make_service();
    await service.create_link(ACTOR, INPUT);
    const first = await service.revoke_link(ACTOR, 'ql-1');

    const second = await service.revoke_link({ ...ACTOR, user_id: 'u-later' }, 'ql-1');

    expect(second.revoked_at).toBe(first.revoked_at);
    expect(second.updated_by).toBe('u-owner');
    expect(audit_store.rows).toHaveLength(2);
  });

  it('refuses an unknown link', async () => {
    const { service } = make_service();

    await expect(service.revoke_link(ACTOR, 'nope')).rejects.toBeInstanceOf(QuickLinkNotFoundError);
  });

  it("refuses another tenant's link and leaves it active", async () => {
    const { service, quick_links } = make_service();
    await service.create_link({ ...ACTOR, tenant_id: 't2' }, INPUT);

    await expect(service.revoke_link(ACTOR, 'ql-1')).rejects.toBeInstanceOf(QuickLinkNotFoundError);
    expect((await quick_links.get_link('t2', 'ql-1'))?.revoked_at).toBeNull();
  });

  it('refuses a link that disappears between the read and the revoke', async () => {
    const { service, quick_links } = make_service();
    await service.create_link(ACTOR, INPUT);
    quick_links.revoke_link = async () => null;

    await expect(service.revoke_link(ACTOR, 'ql-1')).rejects.toBeInstanceOf(QuickLinkNotFoundError);
  });
});

describe('QuickLinkService.view_of', () => {
  it('reports the state at the service clock and never the hash', async () => {
    const { service } = make_service();
    const created = await service.create_link(ACTOR, { ...INPUT, expires_at: 1500 });

    const view = service.view_of(created.link);

    // The clock has passed the expiry by the time the view is built.
    expect(view.state).toBe(QuickLinkState.EXPIRED);
    expect(JSON.stringify(view)).not.toContain(created.link.token_hash);
  });
});
