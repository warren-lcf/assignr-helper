import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import {
  create_audit_log_service,
  create_in_memory_audit_log_store,
  type IInMemoryAuditLog,
} from '@hch-shared-libraries/core-server/audit';
import type { Express } from 'express';
import { create_app } from '../app.js';
import { create_auth_middleware } from '../auth/create_auth_middleware.js';
import { AppRole } from '../auth/enums/app_role.enum.js';
import { MemberStatus } from '../auth/enums/member_status.enum.js';
import { TenantStatus } from '../auth/enums/tenant_status.enum.js';
import { TenantType } from '../auth/enums/tenant_type.enum.js';
import { InMemoryMembershipResolver } from '../auth/in_memory_membership_resolver.js';
import { StaticRoleStore } from '../auth/static_role_store.js';
import { ConnectionAdminService } from '../connections/connection_admin.service.js';
import { create_connections_router } from '../connections/connections.routes.js';
import { create_connections_admin_router } from '../connections/connections_admin.routes.js';
import { ContactService } from '../contacts/contact.service.js';
import { create_contacts_router } from '../contacts/contacts.routes.js';
import { InMemoryContactStore } from '../contacts/stores/in_memory_contact_store.js';
import { InMemoryEmailSender } from '../email_delivery/in_memory_email_sender.js';
import { DigestComposer } from '../email_drafts/digest_composer.js';
import { EmailDraftService } from '../email_drafts/email_draft.service.js';
import { EmailPreviewService } from '../email_drafts/email_preview.service.js';
import { EmailSendService, IEmailSendServiceOptions } from '../email_drafts/email_send.service.js';
import { create_email_drafts_router } from '../email_drafts/email_drafts.routes.js';
import { RecipientResolver } from '../email_drafts/recipient_resolver.js';
import { InMemoryEmailDeliveryStore } from '../email_drafts/stores/in_memory_email_delivery_store.js';
import { InMemoryEmailDraftStore } from '../email_drafts/stores/in_memory_email_draft_store.js';
import { EmailSettingsService } from '../email_settings/email_settings.service.js';
import { create_email_settings_router } from '../email_settings/email_settings.routes.js';
import { InMemoryEmailSettingsVault } from '../email_settings/in_memory_email_settings_vault.js';
import { InMemoryCredentialVault } from '../connections/in_memory_credential_vault.js';
import { IAccountVerifier } from '../connections/ports/account_verifier.interface.js';
import { InMemoryConnectionStore } from '../connections/stores/in_memory_connection_store.js';
import { create_games_router } from '../games/games.routes.js';
import { MatchReportService } from '../match_reports/match_report.service.js';
import { create_match_reports_router } from '../match_reports/match_reports.routes.js';
import { InMemoryMatchReportStore } from '../match_reports/stores/in_memory_match_report_store.js';
import { IRateLimiter } from '../http/rate_limit/rate_limiter.interface.js';
import { TokenBucketRateLimiter } from '../http/rate_limit/token_bucket_rate_limiter.js';
import { GamesListService } from '../games/games_list.service.js';
import { PublicQuickLinkService } from '../quick_links/public_quick_link.service.js';
import { QuickLinkService } from '../quick_links/quick_link.service.js';
import { create_public_quick_links_router } from '../quick_links/public_quick_links.routes.js';
import { create_quick_links_router } from '../quick_links/quick_links.routes.js';
import { InMemoryQuickLinkStore } from '../quick_links/stores/in_memory_quick_link_store.js';
import { InMemorySecretKeyBackend } from '../unsubscribe/in_memory_secret_key_backend.js';
import { create_public_unsubscribe_router } from '../unsubscribe/public_unsubscribe.routes.js';
import { SecretManagerUnsubscribeKeys } from '../unsubscribe/secret_manager_unsubscribe_keys.js';
import { UnsubscribeService } from '../unsubscribe/unsubscribe.service.js';
import { ConnectionSyncService } from './connection_sync.service.js';
import { ISyncHarness, make_sync_harness } from './make_sync_harness.fixture.js';
import { create_sync_router } from './sync.routes.js';

/** Bearer tokens the routes specs sign in with. */
export const ROUTE_TOKENS = {
  owner_a: 'owner-a',
  /** The same person as `owner_a`, with a verified email address. */
  owner_a_verified: 'owner-a-verified',
  /** The same person as `owner_a`, with an address the identity provider has not verified. */
  owner_a_unverified: 'owner-a-unverified',
  member_a: 'member-a',
  owner_b: 'owner-b',
  /** The same person as `owner_b`, with a verified email address. */
  owner_b_verified: 'owner-b-verified',
  admin: 'admin',
} as const;

/** The verified email address of `ROUTE_TOKENS.owner_a_verified`. */
export const OWNER_A_EMAIL = 'owner.a@example.test';

/** The public origin the routes app builds email links from. */
export const ROUTES_APP_ORIGIN = 'https://app.example.test';

/** Everything a routes spec needs. */
export interface IRoutesApp {
  app: Express;
  harness: ISyncHarness;
  connections: InMemoryConnectionStore;
  vault: InMemoryCredentialVault;
  /** Replace to make the fake provider accept, reject or fail credentials. */
  verifier: { verify: IAccountVerifier['verify'] };
  audit: IInMemoryAuditLog;
  quick_links: InMemoryQuickLinkStore;
  match_reports: InMemoryMatchReportStore;
  /** The service behind the match report routes, for specs that build their own stores around it. */
  match_report_service: MatchReportService;
  contacts: InMemoryContactStore;
  email_drafts: InMemoryEmailDraftStore;
  email_deliveries: InMemoryEmailDeliveryStore;
  email_settings: InMemoryEmailSettingsVault;
  /** Records every email the app would have sent; set its `failures` to make recipients fail. */
  email_sender: InMemoryEmailSender;
  unsubscribe: UnsubscribeService;
  /** Builds another send service over the same stores, for example with a different clock or concurrency. */
  make_email_send_service: (overrides?: Partial<IEmailSendServiceOptions>) => EmailSendService;
  /** The secret store behind the unsubscribe signing key. */
  unsubscribe_secrets: InMemorySecretKeyBackend;
}

/** Optional replacements for the routes app's rate limiting and proxy trust. */
export interface IRoutesAppOptions {
  /** Limits every public quick-link request; defaults to a limit no spec reaches by accident. */
  request_limiter?: IRateLimiter;
  /** Limits public requests whose token opens nothing; defaults like `request_limiter`. */
  failure_limiter?: IRateLimiter;
  /** Proxies trusted to report the caller's address; unset trusts none. */
  trust_proxy_hops?: number;
  /** Limits every public unsubscribe request; defaults like `request_limiter`. */
  unsubscribe_request_limiter?: IRateLimiter;
  /** Limits public unsubscribe requests whose token opens nothing; defaults like `request_limiter`. */
  unsubscribe_failure_limiter?: IRateLimiter;
  /** Limits test emails; defaults to a limit no spec reaches by accident. */
  test_send_limiter?: IRateLimiter;
}

/**
 * Builds the real Express app (real auth middleware, real routers) over in-memory
 * stores and a fake provider.
 * @param options Rate limiters and proxy trust to use instead of the generous defaults.
 * @returns The app and the pieces a spec seeds or inspects.
 */
export function make_routes_app(options: IRoutesAppOptions = {}): IRoutesApp {
  const harness = make_sync_harness();
  const connections = new InMemoryConnectionStore();
  const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const service = new ConnectionSyncService({
    connections,
    sessions: {
      create_session: () => ({
        provider: harness.provider,
        ctx: harness.deps.ctx,
        rate_limit_remaining: () => null,
      }),
    },
    stores: {
      games: harness.games,
      organizations: harness.organizations,
      venues: harness.venues,
      runs: harness.runs,
    },
    now: harness.deps.now,
    generate_id: harness.deps.generate_id,
  });
  const games_service = new GamesListService({
    games: harness.games,
    venues: harness.venues,
    organizations: harness.organizations,
    now: harness.clock,
  });
  const vault = new InMemoryCredentialVault();
  const audit = create_in_memory_audit_log_store();
  const verifier: IRoutesApp['verifier'] = {
    verify: async () => ({ external_account_id: 'acct-1', label: 'Metro Youth Soccer' }),
  };
  let admin_ids = 0;
  const admin_service = new ConnectionAdminService({
    connections,
    vault,
    verifier: { verify: (provider, credentials) => verifier.verify(provider, credentials) },
    token_invalidator: { invalidate: () => undefined },
    audit: create_audit_log_service({ store: audit }),
    now: harness.deps.now,
    generate_id: () => `admin-conn-${++admin_ids}`,
  });
  const quick_links = new InMemoryQuickLinkStore();
  let quick_link_ids = 0;
  const quick_link_service = new QuickLinkService({
    quick_links,
    audit: create_audit_log_service({ store: audit }),
    now: harness.clock,
    generate_id: () => `ql-${++quick_link_ids}`,
  });
  const public_quick_link_service = new PublicQuickLinkService({
    quick_links,
    games: harness.games,
    venues: harness.venues,
    now: harness.clock,
  });
  const match_reports = new InMemoryMatchReportStore();
  let match_report_ids = 0;
  const match_report_service = new MatchReportService({
    reports: match_reports,
    games: harness.games,
    audit: create_audit_log_service({ store: audit }),
    now: harness.clock,
    generate_id: () => `mr-${++match_report_ids}`,
  });
  const generous_limiter = (): IRateLimiter =>
    new TokenBucketRateLimiter({
      capacity: 10_000,
      refill_per_minute: 10_000,
      max_keys: 100,
      now: harness.clock,
    });
  const contacts = new InMemoryContactStore();
  const email_drafts = new InMemoryEmailDraftStore();
  const email_deliveries = new InMemoryEmailDeliveryStore();
  const email_settings = new InMemoryEmailSettingsVault();
  const email_sender = new InMemoryEmailSender();
  const unsubscribe_secrets = new InMemorySecretKeyBackend();
  const unsubscribe = new UnsubscribeService({
    keys: new SecretManagerUnsubscribeKeys({
      backend: unsubscribe_secrets,
      generate_key: () => Buffer.alloc(32, 3),
    }),
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: harness.clock,
  });
  let contact_ids = 0;
  const contact_service = new ContactService({
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: harness.clock,
    generate_id: () => `contact-${++contact_ids}`,
  });
  const email_settings_service = new EmailSettingsService({
    vault: email_settings,
    audit: create_audit_log_service({ store: audit }),
  });
  let draft_ids = 0;
  const email_draft_service = new EmailDraftService({
    drafts: email_drafts,
    contacts,
    audit: create_audit_log_service({ store: audit }),
    now: harness.clock,
    generate_id: () => `draft-${++draft_ids}`,
  });
  const recipients = new RecipientResolver(contacts);
  const composer = new DigestComposer({
    games_service,
    venues: harness.venues,
    now: harness.clock,
  });
  const email_preview_service = new EmailPreviewService({
    draft_service: email_draft_service,
    recipients,
    composer,
    settings: email_settings_service,
    sender: email_sender,
    audit: create_audit_log_service({ store: audit }),
    public_app_origin: ROUTES_APP_ORIGIN,
  });
  const send_options: IEmailSendServiceOptions = {
    draft_service: email_draft_service,
    drafts: email_drafts,
    deliveries: email_deliveries,
    contacts,
    recipients,
    composer,
    settings: email_settings_service,
    sender: email_sender,
    quick_links: quick_link_service,
    unsubscribe,
    audit: create_audit_log_service({ store: audit }),
    public_app_origin: ROUTES_APP_ORIGIN,
    now: harness.clock,
  };
  const make_email_send_service = (overrides: Partial<IEmailSendServiceOptions> = {}) =>
    new EmailSendService({ ...send_options, ...overrides });
  const email_send_service = make_email_send_service();
  harness.provider.organizations = [{ external_id: '101', name: 'Metro', flags: {} }];

  const base = {
    tenant_status: TenantStatus.ACTIVE,
    member_status: MemberStatus.ACTIVE,
    created_at: 1,
  };
  const tokens: Record<string, { uid: string; email: string | null; email_verified?: boolean }> = {
    [ROUTE_TOKENS.owner_a]: { uid: 'u-owner-a', email: null },
    [ROUTE_TOKENS.owner_a_verified]: {
      uid: 'u-owner-a',
      email: OWNER_A_EMAIL,
      email_verified: true,
    },
    [ROUTE_TOKENS.owner_a_unverified]: {
      uid: 'u-owner-a',
      email: OWNER_A_EMAIL,
      email_verified: false,
    },
    [ROUTE_TOKENS.member_a]: { uid: 'u-member-a', email: null },
    [ROUTE_TOKENS.owner_b]: { uid: 'u-owner-b', email: null },
    [ROUTE_TOKENS.owner_b_verified]: {
      uid: 'u-owner-b',
      email: 'owner.b@example.test',
      email_verified: true,
    },
    [ROUTE_TOKENS.admin]: { uid: 'u-admin', email: null },
  };
  const app = create_app({
    parse_json_bodies: true,
    trust_proxy_hops: options.trust_proxy_hops,
    mount_routes: (target) => {
      target.use(
        '/api',
        create_public_quick_links_router({
          service: public_quick_link_service,
          request_limiter: options.request_limiter ?? generous_limiter(),
          failure_limiter: options.failure_limiter ?? generous_limiter(),
        }),
      );
      target.use(
        '/api',
        create_public_unsubscribe_router({
          service: unsubscribe,
          request_limiter: options.unsubscribe_request_limiter ?? generous_limiter(),
          failure_limiter: options.unsubscribe_failure_limiter ?? generous_limiter(),
        }),
      );
    },
    auth: {
      permission_service,
      middleware: create_auth_middleware({
        token_verifier: { verify: async (token) => tokens[token] ?? null },
        membership_resolver: new InMemoryMembershipResolver([
          {
            ...base,
            tenant_id: 't1',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-owner-a',
            role_slug: AppRole.TENANT_OWNER,
          },
          {
            ...base,
            tenant_id: 't1',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-member-a',
            role_slug: AppRole.TENANT_MEMBER,
          },
          {
            ...base,
            tenant_id: 't2',
            tenant_type: TenantType.REFEREE,
            user_id: 'u-owner-b',
            role_slug: AppRole.TENANT_OWNER,
          },
          {
            ...base,
            tenant_id: 'platform',
            tenant_type: TenantType.PLATFORM,
            user_id: 'u-admin',
            role_slug: AppRole.PLATFORM_ADMIN,
          },
        ]),
        role_permission_service: permission_service,
      }),
    },
    mount_protected_routes: (target) => {
      target.use('/api', create_connections_router(connections, permission_service));
      target.use('/api', create_connections_admin_router({ admin_service, permission_service }));
      target.use('/api', create_games_router({ games_service, permission_service }));
      target.use(
        '/api',
        create_match_reports_router({ report_service: match_report_service, permission_service }),
      );
      target.use('/api', create_quick_links_router({ quick_link_service, permission_service }));
      target.use('/api', create_contacts_router({ contact_service, permission_service }));
      target.use(
        '/api',
        create_email_settings_router({
          settings_service: email_settings_service,
          permission_service,
        }),
      );
      target.use(
        '/api',
        create_email_drafts_router({
          draft_service: email_draft_service,
          preview_service: email_preview_service,
          send_service: email_send_service,
          permission_service,
          test_send_limiter: options.test_send_limiter ?? generous_limiter(),
        }),
      );
      target.use(
        '/api',
        create_sync_router({
          sync_service: service,
          connections,
          runs: harness.runs,
          permission_service,
        }),
      );
    },
  });
  return {
    app,
    harness,
    connections,
    vault,
    verifier,
    audit,
    quick_links,
    match_reports,
    match_report_service,
    contacts,
    email_drafts,
    email_deliveries,
    email_settings,
    email_sender,
    unsubscribe,
    make_email_send_service,
    unsubscribe_secrets,
  };
}
