import { describe, expect, it } from 'vitest';
import { DeliveryErrorCode } from '../../../email_delivery/enums/delivery_error_code.enum.js';
import { make_contract_tenant_id } from '../../../sync/stores/contracts/make_contract_tenant_id.js';
import { DeliveryStatus } from '../../enums/delivery_status.enum.js';
import { IStoredDraftRecipient } from '../../models/stored_draft_recipient.model.js';
import { IEmailDeliveryStore } from '../../ports/email_delivery_store.interface.js';

/** Generous per-test timeout so a store backed by a real database can run the suite. */
const CONTRACT_TIMEOUT_MS = 60_000;

/**
 * Builds a delivered recipient row for contract tests.
 * @param tenant_id Owning tenant.
 * @param draft_id Draft.
 * @param contact_id Contact.
 * @param overrides Fields to replace.
 * @returns A complete row.
 */
function make_recipient(
  tenant_id: string,
  draft_id: string,
  contact_id: string,
  overrides: Partial<IStoredDraftRecipient> = {},
): IStoredDraftRecipient {
  return {
    tenant_id,
    draft_id,
    contact_id,
    status: DeliveryStatus.SENT,
    provider_message_id: `msg-${contact_id}`,
    error_code: null,
    sent_at: 5000,
    created_at: 5000,
    created_by: 'sender',
    updated_at: 5000,
    updated_by: 'sender',
    ...overrides,
  };
}

/**
 * Registers the behavioural contract every `IEmailDeliveryStore` must satisfy.
 * @param label Name of the implementation under test.
 * @param make Creates a store; called once per test.
 * @returns Nothing; registers a Vitest `describe` block.
 */
export function describe_email_delivery_store_contract(
  label: string,
  make: () => IEmailDeliveryStore,
): void {
  describe(`${label} email delivery store contract`, { timeout: CONTRACT_TIMEOUT_MS }, () => {
    it('records a delivery and lists it back with every field', async () => {
      const store = make();
      const tenant_id = make_contract_tenant_id();
      const row = make_recipient(tenant_id, 'd1', 'c1', {
        provider_message_id: 'sg.abc/123==',
        sent_at: 1786234970000,
      });

      expect(await store.record_result(row)).toBe(true);

      expect(await store.list_recipients(tenant_id, 'd1')).toEqual([row]);
    });

    it('records a failure with its safe code and no message id', async () => {
      const store = make();
      const tenant_id = make_contract_tenant_id();
      const row = make_recipient(tenant_id, 'd1', 'c1', {
        status: DeliveryStatus.FAILED,
        provider_message_id: null,
        error_code: DeliveryErrorCode.PROVIDER_REJECTED,
        sent_at: null,
      });

      await store.record_result(row);

      expect(await store.list_recipients(tenant_id, 'd1')).toEqual([row]);
    });

    it('replaces a failure with a later result and keeps the first created stamp', async () => {
      const store = make();
      const tenant_id = make_contract_tenant_id();
      await store.record_result(
        make_recipient(tenant_id, 'd1', 'c1', {
          status: DeliveryStatus.FAILED,
          provider_message_id: null,
          error_code: DeliveryErrorCode.PROVIDER_UNAVAILABLE,
          sent_at: null,
          created_at: 1000,
          created_by: 'first',
        }),
      );

      const written = await store.record_result(
        make_recipient(tenant_id, 'd1', 'c1', {
          created_at: 9000,
          created_by: 'second',
          updated_at: 9000,
          updated_by: 'second',
        }),
      );

      expect(written).toBe(true);
      const [row] = await store.list_recipients(tenant_id, 'd1');
      expect(row).toMatchObject({
        status: DeliveryStatus.SENT,
        error_code: null,
        created_at: 1000,
        created_by: 'first',
        updated_at: 9000,
        updated_by: 'second',
      });
    });

    it('never overwrites a delivered recipient: the SENT row is final', async () => {
      const store = make();
      const tenant_id = make_contract_tenant_id();
      const delivered = make_recipient(tenant_id, 'd1', 'c1');
      await store.record_result(delivered);

      const as_failure = await store.record_result(
        make_recipient(tenant_id, 'd1', 'c1', {
          status: DeliveryStatus.FAILED,
          provider_message_id: null,
          error_code: DeliveryErrorCode.UNKNOWN,
          sent_at: null,
        }),
      );
      const as_second_send = await store.record_result(
        make_recipient(tenant_id, 'd1', 'c1', { provider_message_id: 'msg-second' }),
      );

      expect(as_failure).toBe(false);
      expect(as_second_send).toBe(false);
      expect(await store.list_recipients(tenant_id, 'd1')).toEqual([delivered]);
    });

    it('lets exactly one of several simultaneous deliveries to one recipient be recorded', async () => {
      const store = make();
      const tenant_id = make_contract_tenant_id();

      const written = await Promise.all(
        [1, 2, 3].map((n) =>
          store.record_result(
            make_recipient(tenant_id, 'd1', 'c1', { provider_message_id: `msg-${n}` }),
          ),
        ),
      );

      expect(written.filter(Boolean)).toHaveLength(1);
      expect(await store.list_recipients(tenant_id, 'd1')).toHaveLength(1);
    });

    it('lists only one draft of one tenant, ordered by contact id', async () => {
      const store = make();
      const [tenant_a, tenant_b] = [make_contract_tenant_id(), make_contract_tenant_id()];
      await store.record_result(make_recipient(tenant_a, 'd1', 'c2'));
      await store.record_result(make_recipient(tenant_a, 'd1', 'c1'));
      await store.record_result(make_recipient(tenant_a, 'd2', 'c3'));
      await store.record_result(make_recipient(tenant_b, 'd1', 'c4'));

      const listed = await store.list_recipients(tenant_a, 'd1');

      expect(listed.map((row) => row.contact_id)).toEqual(['c1', 'c2']);
      expect(await store.list_recipients(tenant_b, 'd2')).toEqual([]);
    });
  });
}
