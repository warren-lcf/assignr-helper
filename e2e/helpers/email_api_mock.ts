import { Page, Request } from '@playwright/test';
import { json } from './settled_layout';
import { SEED_USER_EMAIL } from './sign_in';

/** What a tenant owner may do, as `GET /api/me` reports it: sending email included. */
export const OWNER_PERMISSIONS = [
  'games.read',
  'connections.manage',
  'sync.run',
  'quick_links.manage',
  'email.send',
];

/** What a tenant member holds: no email sending. */
export const MEMBER_PERMISSIONS = ['games.read', 'reports.write'];

/** The secret a spec types as the API key. Obviously fake; the page must keep it out of everything. */
export const FAKE_API_KEY = 'SG.e2e-fake-key-never-real-0123456789';

export interface IMockContact {
  contact_id: string;
  display_name: string;
  email_address: string;
  consent_status: 'GRANTED' | 'UNSUBSCRIBED';
  consent_updated_at: number | null;
  unsubscribed_at: number | null;
  created_at: number;
}

export interface IMockSettings {
  configured: boolean;
  from_email: string | null;
  from_name: string | null;
  reply_to: string | null;
  postal_address: string | null;
}

export interface IMockDraft {
  draft_id: string;
  subject: string;
  intro: string | null;
  filters: Record<string, unknown>;
  include_quick_link: boolean;
  quick_link_expiry_days: number;
  recipient_mode: 'ALL_CONSENTED' | 'SELECTED';
  contact_ids: string[];
  status: 'DRAFT' | 'SENDING' | 'SENT' | 'PARTIALLY_SENT';
  recipient_count: number | null;
  sent_at: number | null;
  created_at: number;
  updated_at: number;
}

/** What the mocked send does next: send to all, fail some, or report that the recipient count moved. */
export type SendPlan = 'OK' | 'PARTIAL' | 'COUNT_CHANGED' | 'SERVER_ERROR';

export interface IMockRequest {
  method: string;
  path: string;
  body: unknown;
  headers: Record<string, string>;
}

/** The in-test backend: its state, and a log of what it was asked. */
export interface IEmailMock {
  settings: IMockSettings;
  contacts: IMockContact[];
  drafts: IMockDraft[];
  requests: IMockRequest[];
  /** Contacts the mocked send has already reached. */
  sent_contact_ids: Set<string>;
}

export interface IEmailMockOptions {
  permissions?: string[];
  settings?: IMockSettings;
  contacts?: IMockContact[];
  drafts?: IMockDraft[];
  /** How many `GET /api/email_drafts` calls fail with a 500 before the mock starts answering. */
  list_failures?: number;
  /** How many games the preview reports. */
  game_count?: number;
  /** What the next sends do, in order; after the list, sends succeed. */
  send_plan?: SendPlan[];
  /** How long a send takes, so a double click has something to hit. */
  send_delay_ms?: number;
  /** Answers the test send with this error code instead of succeeding. */
  test_send_error?: string;
  /** Games the facet source request (`GET /api/games`) returns. */
  games?: { level: string; league: string; age_group: string }[];
}

export const ALICE: IMockContact = {
  contact_id: 'contact-1',
  display_name: 'Alice Archer',
  email_address: 'alice@example.test',
  consent_status: 'GRANTED',
  consent_updated_at: Date.UTC(2026, 8, 1, 10),
  unsubscribed_at: null,
  created_at: Date.UTC(2026, 8, 1, 10),
};
export const BOB: IMockContact = {
  ...ALICE,
  contact_id: 'contact-2',
  display_name: 'Bob Baker',
  email_address: 'bob@example.test',
};
export const CAROL_UNSUBSCRIBED: IMockContact = {
  ...ALICE,
  contact_id: 'contact-3',
  display_name: 'Carol Cruz',
  email_address: 'carol@example.test',
  consent_status: 'UNSUBSCRIBED',
  consent_updated_at: Date.UTC(2026, 9, 2, 9),
  unsubscribed_at: Date.UTC(2026, 9, 2, 9),
};

export const CONFIGURED_SETTINGS: IMockSettings = {
  configured: true,
  from_email: 'games@example.test',
  from_name: 'Metro Referees',
  reply_to: 'help@example.test',
  postal_address: '1 Main St, Springfield',
};
export const UNCONFIGURED_SETTINGS: IMockSettings = {
  configured: false,
  from_email: null,
  from_name: null,
  reply_to: null,
  postal_address: null,
};

/**
 * Builds a draft record.
 * @param overrides Fields to change from an unsent draft to everyone who agreed.
 * @returns The draft.
 */
export function make_mock_draft(overrides: Partial<IMockDraft> = {}): IMockDraft {
  return {
    draft_id: 'draft-1',
    subject: 'Games available this weekend',
    intro: null,
    filters: {},
    include_quick_link: false,
    quick_link_expiry_days: 14,
    recipient_mode: 'ALL_CONSENTED',
    contact_ids: [],
    status: 'DRAFT',
    recipient_count: null,
    sent_at: null,
    created_at: Date.UTC(2026, 9, 5, 15, 4),
    updated_at: Date.UTC(2026, 9, 5, 15, 4),
    ...overrides,
  };
}

/** One draft in each status. */
export function make_initial_drafts(): IMockDraft[] {
  return [
    make_mock_draft({
      draft_id: 'draft-1',
      subject: 'Games available this weekend',
      include_quick_link: true,
      quick_link_expiry_days: 7,
      filters: { level: 'Premier', only_with_open_slots: true },
    }),
    make_mock_draft({
      draft_id: 'draft-2',
      subject: 'Last weekend',
      status: 'SENT',
      recipient_count: 1234,
      sent_at: Date.UTC(2026, 9, 1, 8),
      created_at: Date.UTC(2026, 8, 30, 8),
    }),
    make_mock_draft({
      draft_id: 'draft-3',
      subject: 'Midweek games',
      status: 'PARTIALLY_SENT',
      recipient_count: 10,
      sent_at: Date.UTC(2026, 8, 28, 8),
      created_at: Date.UTC(2026, 8, 27, 8),
    }),
    make_mock_draft({
      draft_id: 'draft-4',
      subject: 'Right now',
      status: 'SENDING',
      created_at: Date.UTC(2026, 8, 26, 8),
    }),
  ];
}

/**
 * The contacts a draft goes to: those who agreed, and for a chosen-people
 * draft only the ones chosen. After a partial send, the ones not yet reached.
 * @param mock The mock's state.
 * @param draft The draft.
 * @returns The contacts.
 */
export function recipients_of(mock: IEmailMock, draft: IMockDraft): IMockContact[] {
  return mock.contacts.filter(
    (contact) =>
      contact.consent_status === 'GRANTED' &&
      (draft.recipient_mode === 'ALL_CONSENTED' ||
        draft.contact_ids.includes(contact.contact_id)) &&
      !(draft.status === 'PARTIALLY_SENT' && mock.sent_contact_ids.has(contact.contact_id)),
  );
}

function build_preview(mock: IEmailMock, draft: IMockDraft, game_count: number) {
  const eligible = recipients_of(mock, draft).length;
  const warnings: string[] = [];
  if (!mock.settings.configured) warnings.push('email_not_configured');
  if (game_count === 0) warnings.push('no_games');
  if (eligible === 0) warnings.push('no_recipients');
  if (eligible > 100) warnings.push('too_many_recipients');
  if (mock.settings.configured && !mock.settings.postal_address) warnings.push('no_postal_address');
  return {
    subject: draft.subject,
    // The script must never run: the page shows this only inside an iframe with an empty sandbox.
    html: '<h1>Riverside Park</h1><p>Lions vs Tigers</p><script>window.parent.__e2e_escaped = true;</script>',
    text: 'Riverside Park\nLions vs Tigers',
    game_count,
    eligible_recipient_count: eligible,
    skipped: {
      unsubscribed: mock.contacts.filter((contact) => contact.consent_status === 'UNSUBSCRIBED')
        .length,
      missing: 0,
    },
    warnings,
  };
}

/** The JSON body of a request, or null for a GET or a request without one. */
function read_body(method: string, request: Request): unknown {
  if (method === 'GET') return null;
  try {
    return request.postDataJSON();
  } catch {
    return null;
  }
}

function failure(code: string, message = 'Failed', violations: unknown[] = []) {
  return { code, message, violations };
}

/**
 * Mocks the backend (it is not running in E2E) for the Email Drafts screen.
 * Only same-origin `/api/**` calls are intercepted, so the Auth emulator is
 * untouched.
 * @param page Page under test.
 * @param options Permissions, what the backend holds, and failures to simulate.
 * @returns The mock's state, to assert on.
 */
export async function install_email_mock(
  page: Page,
  options: IEmailMockOptions = {},
): Promise<IEmailMock> {
  const mock: IEmailMock = {
    settings: { ...(options.settings ?? CONFIGURED_SETTINGS) },
    contacts: (options.contacts ?? [ALICE, BOB, CAROL_UNSUBSCRIBED]).map((c) => ({ ...c })),
    drafts: (options.drafts ?? make_initial_drafts()).map((d) => ({ ...d })),
    requests: [],
    sent_contact_ids: new Set<string>(),
  };
  const permissions = options.permissions ?? OWNER_PERMISSIONS;
  const send_plan = [...(options.send_plan ?? [])];
  const game_count = options.game_count ?? 4;
  let list_failures_left = options.list_failures ?? 0;
  let next_id = 10;
  let clock = Date.UTC(2026, 9, 7, 12);
  const games = options.games ?? [
    { level: 'Premier', league: 'Fall League', age_group: 'U12' },
    { level: 'Select', league: 'Fall League', age_group: 'U14' },
  ];

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;
      const body = read_body(method, request);
      mock.requests.push({ method, path, body, headers: request.headers() });

      if (method === 'GET' && path === '/api/me') {
        return json(route, 200, {
          data: {
            uid: 'u1',
            email: SEED_USER_EMAIL,
            tenant_id: 'tenant-1',
            role: 'TENANT_OWNER',
            actual_tenant_id: 'tenant-1',
            actual_role: 'TENANT_OWNER',
            permissions,
          },
        });
      }

      if (method === 'GET' && path === '/api/games') {
        return json(route, 200, {
          data: {
            locations: [
              {
                location_label: 'Riverside Park',
                dates: [
                  {
                    local_date: Date.UTC(2026, 9, 10),
                    games: games.map((game, index) => ({
                      game_id: `g${index}`,
                      ...game,
                      location_group: 'Riverside Park',
                    })),
                  },
                ],
              },
            ],
            total: games.length,
            truncated: false,
          },
        });
      }

      // ---- settings ----
      if (path === '/api/email/settings') {
        if (method === 'GET') return json(route, 200, { data: { settings: mock.settings } });
        if (method === 'DELETE') {
          mock.settings = { ...UNCONFIGURED_SETTINGS };
          return json(route, 200, { data: { deleted: true } });
        }
        if (method === 'PUT') {
          const input = body as Record<string, string | null | undefined>;
          if (!input['api_key'] && !mock.settings.configured) {
            return json(
              route,
              400,
              failure('VALIDATION_ERROR', 'Invalid', [
                { path: 'api_key', message: 'The API key is required the first time' },
              ]),
            );
          }
          mock.settings = {
            configured: true,
            from_email: input['from_email'] ?? null,
            from_name: input['from_name'] ?? null,
            reply_to: input['reply_to'] ?? null,
            postal_address: input['postal_address'] ?? null,
          };
          return json(route, 200, { data: { settings: mock.settings } });
        }
      }

      // ---- contacts ----
      if (path === '/api/contacts' && method === 'GET') {
        return json(route, 200, { data: { contacts: mock.contacts } });
      }
      if (path === '/api/contacts' && method === 'POST') {
        const input = body as {
          display_name: string;
          email_address: string;
          consent_attested: boolean;
        };
        if (input.consent_attested !== true) {
          return json(
            route,
            400,
            failure('VALIDATION_ERROR', 'Invalid', [
              { path: 'consent_attested', message: 'Consent must be attested' },
            ]),
          );
        }
        if (
          mock.contacts.some(
            (c) => c.email_address.toLowerCase() === input.email_address.toLowerCase(),
          )
        ) {
          return json(route, 409, failure('CONTACT_EXISTS', 'Exists'));
        }
        const contact: IMockContact = {
          contact_id: `contact-${next_id++}`,
          display_name: input.display_name,
          email_address: input.email_address,
          consent_status: 'GRANTED',
          consent_updated_at: (clock += 1000),
          unsubscribed_at: null,
          created_at: clock,
        };
        mock.contacts.push(contact);
        return json(route, 201, { data: { contact } });
      }
      if (path === '/api/contacts/import' && method === 'POST') {
        const input = body as {
          entries: { display_name?: string; email_address: string }[];
          consent_attested: boolean;
        };
        let added = 0;
        let skipped_existing = 0;
        const invalid: { row: number; reason: string }[] = [];
        input.entries.forEach((entry, index) => {
          if (entry.email_address.includes('bounce')) {
            invalid.push({ row: index + 1, reason: 'Domain not accepted' });
          } else if (mock.contacts.some((c) => c.email_address === entry.email_address)) {
            skipped_existing++;
          } else {
            added++;
            mock.contacts.push({
              contact_id: `contact-${next_id++}`,
              display_name: entry.display_name ?? entry.email_address,
              email_address: entry.email_address,
              consent_status: 'GRANTED',
              consent_updated_at: (clock += 1000),
              unsubscribed_at: null,
              created_at: clock,
            });
          }
        });
        return json(route, 200, { data: { added, skipped_existing, invalid } });
      }
      const contact_match = /^\/api\/contacts\/([^/]+)$/.exec(path);
      if (contact_match && method === 'DELETE') {
        mock.contacts = mock.contacts.filter((c) => c.contact_id !== contact_match[1]);
        return json(route, 200, { data: { deleted: true } });
      }

      // ---- drafts ----
      if (path === '/api/email_drafts' && method === 'GET') {
        if (list_failures_left > 0) {
          list_failures_left--;
          return json(route, 500, failure('INTERNAL', 'Boom'));
        }
        return json(route, 200, { data: { drafts: mock.drafts } });
      }
      if (path === '/api/email_drafts' && method === 'POST') {
        const input = body as Partial<IMockDraft>;
        if (!input.subject?.trim()) {
          return json(
            route,
            400,
            failure('VALIDATION_ERROR', 'Invalid', [
              { path: 'subject', message: 'Subject is required' },
            ]),
          );
        }
        const draft = make_mock_draft({
          ...input,
          draft_id: `draft-${next_id++}`,
          status: 'DRAFT',
          created_at: (clock += 1000),
          updated_at: clock,
          contact_ids: input.contact_ids ?? [],
        });
        mock.drafts.unshift(draft);
        return json(route, 201, { data: { draft } });
      }
      const draft_match = /^\/api\/email_drafts\/([^/]+)(?:\/(preview|test_send|send))?$/.exec(
        path,
      );
      if (draft_match) {
        const draft = mock.drafts.find((candidate) => candidate.draft_id === draft_match[1]);
        const action = draft_match[2];
        if (!draft) return json(route, 404, failure('NOT_FOUND', 'Not found'));

        if (!action && method === 'GET') return json(route, 200, { data: { draft } });
        if (!action && method === 'PUT') {
          if (draft.status !== 'DRAFT') return json(route, 409, failure('DRAFT_LOCKED', 'Locked'));
          Object.assign(draft, { contact_ids: [] }, body as Partial<IMockDraft>, {
            updated_at: (clock += 1000),
          });
          return json(route, 200, { data: { draft } });
        }
        if (!action && method === 'DELETE') {
          if (draft.status !== 'DRAFT') return json(route, 409, failure('DRAFT_LOCKED', 'Locked'));
          mock.drafts = mock.drafts.filter((candidate) => candidate !== draft);
          return json(route, 200, { data: { deleted: true } });
        }
        if (action === 'preview' && method === 'GET') {
          return json(route, 200, { data: build_preview(mock, draft, game_count) });
        }
        if (action === 'test_send' && method === 'POST') {
          if (options.test_send_error) return json(route, 409, failure(options.test_send_error));
          return json(route, 200, { data: { sent: true } });
        }
        if (action === 'send' && method === 'POST') {
          if (options.send_delay_ms) await new Promise((r) => setTimeout(r, options.send_delay_ms));
          if (draft.status === 'SENT' || draft.status === 'SENDING') {
            return json(route, 409, failure('DRAFT_LOCKED', 'Locked'));
          }
          const plan = send_plan.shift() ?? 'OK';
          if (plan === 'SERVER_ERROR') return json(route, 500, failure('INTERNAL', 'Boom'));
          if (!mock.settings.configured) return json(route, 422, failure('EMAIL_NOT_CONFIGURED'));
          const recipients = recipients_of(mock, draft);
          const confirmed = (body as { confirm_recipient_count: number }).confirm_recipient_count;
          if (plan === 'COUNT_CHANGED' || confirmed !== recipients.length) {
            if (plan === 'COUNT_CHANGED') {
              mock.contacts.push({
                ...ALICE,
                contact_id: `contact-${next_id++}`,
                display_name: 'Dana Diaz',
                email_address: 'dana@example.test',
              });
            }
            return json(route, 409, failure('RECIPIENT_COUNT_CHANGED'));
          }
          const results = recipients.map((contact, index) => {
            const fails = plan === 'PARTIAL' && index > 0;
            if (!fails) mock.sent_contact_ids.add(contact.contact_id);
            return {
              contact_id: contact.contact_id,
              status: fails ? 'FAILED' : 'SENT',
              error_code: fails ? 'PROVIDER_REJECTED' : null,
            };
          });
          const failed = results.filter((row) => row.status === 'FAILED').length;
          draft.status = failed > 0 ? 'PARTIALLY_SENT' : 'SENT';
          draft.recipient_count = results.length - failed;
          draft.sent_at = clock += 1000;
          draft.updated_at = clock;
          return json(route, 200, {
            data: { status: draft.status, sent: results.length - failed, failed, results },
          });
        }
      }

      return json(route, 404, failure('NOT_FOUND', 'Not found'));
    },
  );
  return mock;
}

/**
 * The requests the mock saw for one method and path pattern.
 * @param mock The mock's state.
 * @param method HTTP method.
 * @param path Pattern the path must match.
 * @returns The matching requests, oldest first.
 */
export function requests_to(mock: IEmailMock, method: string, path: RegExp): IMockRequest[] {
  return mock.requests.filter((request) => request.method === method && path.test(request.path));
}
