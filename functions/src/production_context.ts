import { randomUUID } from 'node:crypto';
import { Spanner } from '@google-cloud/spanner';
import { create_role_permission_service } from '@hch-shared-libraries/core-server';
import {
  create_audit_log_service,
  create_spanner_audit_log_store,
} from '@hch-shared-libraries/core-server/audit';
import type { ICommonSpannerDatabase } from '@hch-shared-libraries/core-server';
import { create_google_secret_manager_client } from '@hch-shared-libraries/core-server/secrets';
import { create_auth_middleware } from './auth/create_auth_middleware.js';
import { FirebaseTokenVerifier } from './auth/firebase_token_verifier.js';
import { IAppAuth } from './auth/models/app_auth.model.js';
import { SpannerMembershipResolver } from './auth/spanner_membership_resolver.js';
import { StaticRoleStore } from './auth/static_role_store.js';
import { CalendarFeedAdminService } from './calendar_feed/calendar_feed_admin.service.js';
import { ICalendarFeedStore } from './calendar_feed/ports/calendar_feed_store.interface.js';
import { PublicCalendarFeedService } from './calendar_feed/public_calendar_feed.service.js';
import { SpannerCalendarFeedStore } from './calendar_feed/stores/spanner_calendar_feed_store.js';
import { read_public_app_origin } from './config/read_public_app_origin.js';
import { require_env } from './config/require_env.js';
import { ContactService } from './contacts/contact.service.js';
import { IContactStore } from './contacts/ports/contact_store.interface.js';
import { SpannerContactStore } from './contacts/stores/spanner_contact_store.js';
import { SendGridEmailSender } from './email_delivery/sendgrid_email_sender.js';
import { DigestComposer } from './email_drafts/digest_composer.js';
import { EmailDraftService } from './email_drafts/email_draft.service.js';
import { EmailPreviewService } from './email_drafts/email_preview.service.js';
import { EmailSendService } from './email_drafts/email_send.service.js';
import { RecipientResolver } from './email_drafts/recipient_resolver.js';
import { SpannerEmailDeliveryStore } from './email_drafts/stores/spanner_email_delivery_store.js';
import { SpannerEmailDraftStore } from './email_drafts/stores/spanner_email_draft_store.js';
import { EmailSettingsService } from './email_settings/email_settings.service.js';
import { SecretManagerEmailSettingsVault } from './email_settings/secret_manager_email_settings_vault.js';
import { GamesListService } from './games/games_list.service.js';
import { MatchReportService } from './match_reports/match_report.service.js';
import { IMatchReportStore } from './match_reports/ports/match_report_store.interface.js';
import { SpannerMatchReportStore } from './match_reports/stores/spanner_match_report_store.js';
import { ClientCredentialsTokenSource } from './connections/client_credentials_token_source.js';
import { ConnectionAdminService } from './connections/connection_admin.service.js';
import { SecretManagerCredentialVault } from './connections/secret_manager_credential_vault.js';
import { IConnectionStore } from './connections/ports/connection_store.interface.js';
import { SpannerConnectionStore } from './connections/stores/spanner_connection_store.js';
import { PublicQuickLinkService } from './quick_links/public_quick_link.service.js';
import { IQuickLinkStore } from './quick_links/ports/quick_link_store.interface.js';
import { QuickLinkService } from './quick_links/quick_link.service.js';
import { SpannerQuickLinkStore } from './quick_links/stores/spanner_quick_link_store.js';
import { GoogleSecretKeyBackend } from './unsubscribe/google_secret_key_backend.js';
import { SecretManagerUnsubscribeKeys } from './unsubscribe/secret_manager_unsubscribe_keys.js';
import { UnsubscribeService } from './unsubscribe/unsubscribe.service.js';
import { AssignrAccountVerifier } from './integrations/assignr/assignr_account_verifier.js';
import { AssignrTokenClient } from './integrations/assignr/assignr_token_client.js';
import { AssignrSessionFactory } from './sync/assignr_session_factory.js';
import { ConnectionSyncService } from './sync/connection_sync.service.js';
import { ISyncRunStore } from './sync/ports/sync_run_store.interface.js';
import { SpannerGameStore } from './sync/stores/spanner_game_store.js';
import { SpannerOrganizationStore } from './sync/stores/spanner_organization_store.js';
import { SpannerSyncRunStore } from './sync/stores/spanner_sync_run_store.js';
import { SpannerVenueStore } from './sync/stores/spanner_venue_store.js';

/** The real services, built once per function instance from the environment. */
export interface IProductionContext {
  auth: IAppAuth;
  connections: IConnectionStore;
  sync_runs: ISyncRunStore;
  sync_service: ConnectionSyncService;
  games_service: GamesListService;
  match_reports: IMatchReportStore;
  match_report_service: MatchReportService;
  admin_service: ConnectionAdminService;
  quick_links: IQuickLinkStore;
  quick_link_service: QuickLinkService;
  public_quick_link_service: PublicQuickLinkService;
  calendar_feeds: ICalendarFeedStore;
  calendar_feed_admin_service: CalendarFeedAdminService;
  public_calendar_feed_service: PublicCalendarFeedService;
  contacts: IContactStore;
  contact_service: ContactService;
  email_settings_service: EmailSettingsService;
  email_draft_service: EmailDraftService;
  email_preview_service: EmailPreviewService;
  email_send_service: EmailSendService;
  unsubscribe_service: UnsubscribeService;
}

/**
 * Wires the real implementations: Firebase token verification, Spanner stores,
 * the fixed role set, and the Assignr session factory. Reads the Spanner
 * location from the environment and throws when any of it is missing.
 *
 * Each tenant's provider client credentials live in Secret Manager (one secret
 * per connection, written through the settings API); access tokens are requested
 * on demand and cached only in memory. Each tenant's SendGrid key and sender details
 * are likewise one secret per tenant. The key that signs unsubscribe links is a
 * platform-level secret, created on first use. `PUBLIC_APP_ORIGIN` is required.
 * @param env Environment to read; defaults to `process.env`.
 * @returns The wired services.
 */
export function create_production_context(
  env: NodeJS.ProcessEnv = process.env,
): IProductionContext {
  const spanner = new Spanner({ projectId: require_env('SPANNER_PROJECT_ID', env) });
  const database = spanner
    .instance(require_env('SPANNER_INSTANCE_ID', env))
    .database(require_env('SPANNER_DATABASE_ID', env));

  const permission_service = create_role_permission_service({ store: new StaticRoleStore() });
  const connections = new SpannerConnectionStore(database);
  const sync_runs = new SpannerSyncRunStore(database);
  const games = new SpannerGameStore(database);
  const organizations = new SpannerOrganizationStore(database);
  const venues = new SpannerVenueStore(database);
  const quick_links = new SpannerQuickLinkStore(database);
  const calendar_feeds = new SpannerCalendarFeedStore(database);
  const match_reports = new SpannerMatchReportStore(database);
  const contacts = new SpannerContactStore(database);
  const email_drafts = new SpannerEmailDraftStore(database);
  const email_deliveries = new SpannerEmailDeliveryStore(database);
  const public_app_origin = read_public_app_origin(env);

  const secret_manager_project_id = require_env('SECRET_MANAGER_PROJECT_ID', env);
  const secrets = create_google_secret_manager_client({ project_id: secret_manager_project_id });
  const vault = new SecretManagerCredentialVault(secrets);
  const token_client = new AssignrTokenClient();
  const token_source = new ClientCredentialsTokenSource({ vault, token_client });
  const audit = create_audit_log_service({
    store: create_spanner_audit_log_store({
      database: database as unknown as ICommonSpannerDatabase,
    }),
  });

  const games_service = new GamesListService({ games, venues, organizations, now: Date.now });
  const match_report_service = new MatchReportService({
    reports: match_reports,
    games,
    audit,
    now: Date.now,
    generate_id: randomUUID,
  });
  const quick_link_service = new QuickLinkService({
    quick_links,
    audit,
    now: Date.now,
    generate_id: randomUUID,
  });
  const email_settings_service = new EmailSettingsService({
    vault: new SecretManagerEmailSettingsVault(secrets),
    audit,
  });
  const unsubscribe_service = new UnsubscribeService({
    keys: new SecretManagerUnsubscribeKeys({
      backend: new GoogleSecretKeyBackend(secret_manager_project_id),
    }),
    contacts,
    audit,
    now: Date.now,
  });
  const email_draft_service = new EmailDraftService({
    drafts: email_drafts,
    contacts,
    audit,
    now: Date.now,
    generate_id: randomUUID,
  });
  const recipients = new RecipientResolver(contacts);
  const composer = new DigestComposer({ games_service, venues, now: Date.now });
  const email_sender = new SendGridEmailSender();

  return {
    auth: {
      permission_service,
      middleware: create_auth_middleware({
        token_verifier: new FirebaseTokenVerifier(),
        membership_resolver: new SpannerMembershipResolver(database),
        role_permission_service: permission_service,
      }),
    },
    connections,
    sync_runs,
    sync_service: new ConnectionSyncService({
      connections,
      sessions: new AssignrSessionFactory({ token_source }),
      stores: { games, organizations, venues, runs: sync_runs },
      now: Date.now,
      generate_id: randomUUID,
    }),
    games_service,
    match_reports,
    match_report_service,
    admin_service: new ConnectionAdminService({
      connections,
      vault,
      verifier: new AssignrAccountVerifier({ token_client }),
      token_invalidator: token_source,
      audit,
      now: Date.now,
      generate_id: randomUUID,
    }),
    quick_links,
    quick_link_service,
    public_quick_link_service: new PublicQuickLinkService({
      quick_links,
      games,
      venues,
      now: Date.now,
    }),
    calendar_feeds,
    calendar_feed_admin_service: new CalendarFeedAdminService({ feeds: calendar_feeds, audit }),
    public_calendar_feed_service: new PublicCalendarFeedService({
      feeds: calendar_feeds,
      games,
      venues,
      organizations,
      public_app_origin,
      now: Date.now,
    }),
    contacts,
    contact_service: new ContactService({
      contacts,
      audit,
      now: Date.now,
      generate_id: randomUUID,
    }),
    email_settings_service,
    email_draft_service,
    email_preview_service: new EmailPreviewService({
      draft_service: email_draft_service,
      recipients,
      composer,
      settings: email_settings_service,
      sender: email_sender,
      audit,
      public_app_origin,
    }),
    email_send_service: new EmailSendService({
      draft_service: email_draft_service,
      drafts: email_drafts,
      deliveries: email_deliveries,
      contacts,
      recipients,
      composer,
      settings: email_settings_service,
      sender: email_sender,
      quick_links: quick_link_service,
      unsubscribe: unsubscribe_service,
      audit,
      public_app_origin,
      now: Date.now,
    }),
    unsubscribe_service,
  };
}
