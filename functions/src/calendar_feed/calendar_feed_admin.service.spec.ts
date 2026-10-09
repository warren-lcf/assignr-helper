import { hash_bearer_token } from '@hch-shared-libraries/core-server';
import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import { describe, expect, it, vi } from 'vitest';
import { IActingUser } from '../http/models/acting_user.model.js';
import {
  CALENDAR_FEED_AUDIT_RESOURCE,
  CalendarFeedAdminService,
} from './calendar_feed_admin.service.js';
import { CalendarFeedExistsError } from './errors/calendar_feed_exists.error.js';
import { CalendarFeedNotFoundError } from './errors/calendar_feed_not_found.error.js';
import { InMemoryCalendarFeedStore } from './stores/in_memory_calendar_feed_store.js';

const ACTOR: IActingUser = {
  tenant_id: 't1',
  user_id: 'u-owner',
  actual_role: 'PLATFORM_ADMIN',
  effective_role: 'TENANT_OWNER',
};
const TOKEN_ONE = 'T'.repeat(43);
const TOKEN_TWO = 'U'.repeat(43);

/**
 * Builds the service over in-memory parts and a token generator that returns known tokens in turn.
 * @returns The service and the parts a spec inspects.
 */
function make_service() {
  const feeds = new InMemoryCalendarFeedStore({ now: () => 5000 });
  const audit_store = create_in_memory_audit_log_store();
  const tokens = [TOKEN_ONE, TOKEN_TWO, 'V'.repeat(43)];
  const service = new CalendarFeedAdminService({
    feeds,
    audit: create_audit_log_service({ store: audit_store, now: () => 7000 }),
    generate_token: () => tokens.shift() ?? 'W'.repeat(43),
  });
  return { service, feeds, audit_store };
}

describe('CalendarFeedAdminService.issue_feed', () => {
  it('returns the token once and stores only its hash, stamped with the actor', async () => {
    const { service, feeds } = make_service();

    const issued = await service.issue_feed(ACTOR);

    expect(issued.token).toBe(TOKEN_ONE);
    expect(issued.feed).toMatchObject({
      tenant_id: 't1',
      token_hash: hash_bearer_token(TOKEN_ONE),
      rotation_count: 0,
      created_by: 'u-owner',
      updated_by: 'u-owner',
    });
    const stored = await feeds.get_feed('t1');
    expect(stored).toEqual(issued.feed);
    expect(JSON.stringify(stored)).not.toContain(TOKEN_ONE);
  });

  it('mints a random 43 character token when none is injected', async () => {
    const service = new CalendarFeedAdminService({
      feeds: new InMemoryCalendarFeedStore(),
      audit: create_audit_log_service({ store: create_in_memory_audit_log_store() }),
    });

    const first = await service.issue_feed(ACTOR);
    const second = await service.rotate_feed(ACTOR);

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.token).not.toBe(first.token);
  });

  it('writes one CREATE audit row with both roles and an allow-listed state', async () => {
    const { service, audit_store } = make_service();

    await service.issue_feed(ACTOR);

    expect(audit_store.rows).toHaveLength(1);
    const [row] = audit_store.rows;
    expect(row).toMatchObject({
      user_id: 'u-owner',
      tenant_id: 't1',
      resource_type: CALENDAR_FEED_AUDIT_RESOURCE,
      resource_id: 't1',
      action: 'CREATE',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
      before_state_json: null,
    });
    expect(JSON.parse(String(row?.after_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 0,
    });
  });

  it('never writes the token or its hash to the audit trail', async () => {
    const { service, audit_store } = make_service();

    await service.issue_feed(ACTOR);
    await service.rotate_feed(ACTOR);

    const serialized = JSON.stringify(audit_store.rows);
    for (const secret of [
      TOKEN_ONE,
      TOKEN_TWO,
      hash_bearer_token(TOKEN_ONE),
      hash_bearer_token(TOKEN_TWO),
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('refuses a second feed, keeps the first link working and writes no second audit row', async () => {
    const { service, feeds, audit_store } = make_service();
    await service.issue_feed(ACTOR);

    await expect(service.issue_feed(ACTOR)).rejects.toBeInstanceOf(CalendarFeedExistsError);

    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBe('t1');
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_TWO))).toBeNull();
    expect(audit_store.rows).toHaveLength(1);
  });

  it('lets exactly one of two simultaneous issues succeed', async () => {
    const { service, audit_store } = make_service();

    const outcomes = await Promise.allSettled([
      service.issue_feed(ACTOR),
      service.issue_feed(ACTOR),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(CalendarFeedExistsError);
    expect(audit_store.rows).toHaveLength(1);
  });

  it('keeps tenants apart: another tenant can issue its own feed', async () => {
    const { service, feeds } = make_service();
    await service.issue_feed(ACTOR);

    await service.issue_feed({ ...ACTOR, tenant_id: 't2' });

    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBe('t1');
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_TWO))).toBe('t2');
  });
});

describe('CalendarFeedAdminService.rotate_feed', () => {
  it('replaces the token in one write: the old one stops, the new one works, the count goes up', async () => {
    const { service, feeds } = make_service();
    await service.issue_feed(ACTOR);

    const rotated = await service.rotate_feed({ ...ACTOR, user_id: 'u-other-owner' });

    expect(rotated.token).toBe(TOKEN_TWO);
    expect(rotated.feed).toMatchObject({
      rotation_count: 1,
      created_by: 'u-owner',
      updated_by: 'u-other-owner',
    });
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBeNull();
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_TWO))).toBe('t1');
  });

  it('writes a KEY_RESET audit row showing the count before and after', async () => {
    const { service, audit_store } = make_service();
    await service.issue_feed(ACTOR);

    await service.rotate_feed(ACTOR);

    expect(audit_store.rows).toHaveLength(2);
    const row = audit_store.rows[1];
    expect(row).toMatchObject({
      resource_type: 'calendar_feed',
      resource_id: 't1',
      action: 'KEY_RESET',
      actual_role: 'PLATFORM_ADMIN',
      effective_role: 'TENANT_OWNER',
    });
    expect(JSON.parse(String(row?.before_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 0,
    });
    expect(JSON.parse(String(row?.after_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 1,
    });
  });

  it('fails when there is no feed, creating nothing and writing no audit row', async () => {
    const { service, feeds, audit_store } = make_service();

    await expect(service.rotate_feed(ACTOR)).rejects.toBeInstanceOf(CalendarFeedNotFoundError);

    expect(await feeds.get_feed('t1')).toBeNull();
    expect(audit_store.rows).toHaveLength(0);
  });

  it('does not bring back a feed that was switched off between the read and the write', async () => {
    const { service, feeds } = make_service();
    await service.issue_feed(ACTOR);
    const stale = await feeds.get_feed('t1');
    await feeds.delete_token('t1');
    vi.spyOn(feeds, 'get_feed').mockResolvedValueOnce(stale);

    await expect(service.rotate_feed(ACTOR)).rejects.toBeInstanceOf(CalendarFeedNotFoundError);

    expect(await feeds.get_feed('t1')).toBeNull();
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_TWO))).toBeNull();
  });

  it("never touches another tenant's feed", async () => {
    const { service, feeds } = make_service();
    await service.issue_feed(ACTOR);

    await expect(service.rotate_feed({ ...ACTOR, tenant_id: 't2' })).rejects.toBeInstanceOf(
      CalendarFeedNotFoundError,
    );

    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBe('t1');
  });
});

describe('CalendarFeedAdminService.revoke_feed', () => {
  it('removes the feed so its token stops working, with one DELETE audit row', async () => {
    const { service, feeds, audit_store } = make_service();
    await service.issue_feed(ACTOR);

    const revoked = await service.revoke_feed(ACTOR);

    expect(revoked).toBe(true);
    expect(await feeds.get_feed('t1')).toBeNull();
    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBeNull();
    const row = audit_store.rows[1];
    expect(row).toMatchObject({
      action: 'DELETE',
      resource_type: 'calendar_feed',
      resource_id: 't1',
    });
    expect(JSON.parse(String(row?.before_state_json))).toEqual({
      status: 'ACTIVE',
      rotation_count: 0,
    });
    expect(row?.after_state_json).toBeNull();
  });

  it('succeeds again when there is nothing left, writing no extra audit row', async () => {
    const { service, audit_store } = make_service();
    await service.issue_feed(ACTOR);
    await service.revoke_feed(ACTOR);

    const again = await service.revoke_feed(ACTOR);

    expect(again).toBe(false);
    expect(audit_store.rows).toHaveLength(2);
  });

  it('succeeds for a tenant that never had a feed', async () => {
    const { service, audit_store } = make_service();

    expect(await service.revoke_feed(ACTOR)).toBe(false);

    expect(audit_store.rows).toHaveLength(0);
  });

  it("leaves another tenant's feed alone", async () => {
    const { service, feeds } = make_service();
    await service.issue_feed(ACTOR);

    await service.revoke_feed({ ...ACTOR, tenant_id: 't2' });

    expect(await feeds.find_subscriber_by_token_hash(hash_bearer_token(TOKEN_ONE))).toBe('t1');
  });

  it('allows a new feed afterwards, counting from zero', async () => {
    const { service } = make_service();
    await service.issue_feed(ACTOR);
    await service.rotate_feed(ACTOR);
    await service.revoke_feed(ACTOR);

    const again = await service.issue_feed(ACTOR);

    expect(again.feed.rotation_count).toBe(0);
  });
});

describe('CalendarFeedAdminService.get_feed', () => {
  it('reads the tenant feed or null', async () => {
    const { service } = make_service();

    expect(await service.get_feed('t1')).toBeNull();
    await service.issue_feed(ACTOR);
    expect(await service.get_feed('t1')).toMatchObject({ tenant_id: 't1' });
    expect(await service.get_feed('t2')).toBeNull();
  });
});
