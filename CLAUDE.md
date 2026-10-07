# Assignr Helper

Referee app: open and assigned games across several assignors, a "games available" email with a live quick link, and fast post-game score and card entry. Assignr is the first integration; all vendor code sits behind `ISchedulingProvider` (`functions/src/integrations/ports/`). The global `~/.claude/CLAUDE.md` standards apply; this file records project facts and where reality differs from them.

## Architecture

- Angular 22.2 SPA (zoneless, OnPush, signals) in `src/`. It talks only to our `/api/**`; it never calls a vendor.
- One Express app served by the HTTPS function `assignr_helper_api` (`functions/src/index.ts`, `us-east4`, 512MiB).
- Canonical data lives in Spanner database `assignr-helper` on the shared instance `shared` in project `hamble-creek-holdings`. The app runs in GCP project `assignr-helper-prod`.
- Reads come from our copy. Writes (accept, decline, claim) go through a service that calls the provider, then updates our copy and the audit trail.
- Sync (`functions/src/sync/`): `run_sync` pulls one kind (reference data, open games, my games) through `ISchedulingProvider`, merges with `merge_stored_game`, and records an `ISyncRun`. `sync_connection` runs the three in order. Stores are ports (`IGameStore`, `IVenueStore`, `IOrganizationStore`, `ISyncRunStore`) with in-memory implementations only; the Spanner stores arrive once core-server is installed. Removal is safe by design: a game is only marked gone when its organization was read completely (`IListGamesResult.complete_organization_external_ids`), the open list owns `is_open`, the account's own list owns `is_mine`, and games are soft-removed (`removed_at`), never deleted. Nothing schedules or exposes it yet (needs the auth middleware and Cloud Scheduler wiring).
- Plan and decisions: `C:\Users\warre\.claude\plans\as-a-senior-product-distributed-tarjan.md` (not in the repo).

## Commands

| Task                              | Command                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, typecheck, unit tests       | `npm run lint`, `npm run typecheck`, `npm test`                                                                                                                                                                              |
| Functions typecheck, tests, build | `npm run functions:build`, `npm run functions:test` (or `npm --prefix functions run <script>`)                                                                                                                               |
| Format                            | `npm run format` (Prettier; run on every file you change)                                                                                                                                                                    |
| Docs                              | `npm run docs`, `npm --prefix functions run docs` (output in `documentation/generated/`)                                                                                                                                     |
| E2E (8-project matrix)            | `npm run e2e`. Set `PW_PORT_OFFSET` to a distinct value for concurrent runs. Run once, at the end, before any push.                                                                                                          |
| Migrations                        | `npm --prefix functions run migrate` with `SPANNER_PROJECT_ID`, `SPANNER_INSTANCE_ID`, `SPANNER_DATABASE_ID`. Against real Spanner also `CONFIRM_PRODUCTION_MIGRATION=true`. Production migrates only via `cloudbuild.yaml`. |

Always run tests through these scripts, never a bare `npx vitest` or `npx playwright test`.

## Deviations from the global standards (follow the libraries' reality)

- `@hch-shared-libraries/ui-kit` has an empty root export. Import from subpaths (`/app`, `/core`, `/data`, `/common`, `/authorization`).
- `TranslationService` is app-owned and bound to the ui-kit `TRANSLATION_PROVIDER` token.
- `hchUserDate` is `UserDatePipe` from `ui-kit/core`. It has no per-call time zone yet (issue #996), so venue-local time rendering is blocked on it.
- core-server has no shared Firebase auth middleware (#987), Swagger helper (#989) or connector framework (#986). `functions/src/auth/` will be app-owned until they ship.
- The generated Angular app uses Vitest through `ng test`; `ng generate` is configured for `.component.ts` file names (2016 style guide).

## Blocked work (do not stub)

- **Shared packages are installed (14.17.0), but only the shell is wired.** Not yet built on top of them: Spanner stores, `hch-schema` tables (tenants, audit_log, outbox, communications, share links), the auth middleware, and scheduling. If installs return 403, the registry token expired (about an hour); rerun `npx google-artifactregistry-auth`. `functions/` needs its own `.npmrc` for the scope, and its vitest stays on ^4 because core-server's optional peer rejects vitest 5.
- **Shell wiring (`src/app/core`).** `AppComponent` renders `hch-app-shell`; `IdentityService` implements the header's identity contract over an `IAuthGateway` port (Firebase Auth loaded lazily; the Auth emulator in development via `src/environments/environment.ts`). `AppTranslationService` layers `assets/i18n/<locale>.json` over the ui-kit's bundled strings. Every nav entry has a guarded route that renders `FeaturePlaceholderComponent` until the real feature exists. Sign-in must also be enabled in the Firebase console for `assignr-helper-prod` (email/password and Google); that cannot be scripted from here.
- **Local emulators.** Auth: `npm run emulators` (Auth emulator on 9099, UI disabled because 4000 is commonly taken), then `npm run seed:auth` (idempotent, refuses non-local hosts). The seeded test user lives in `scripts/seed/auth_users.seed.json` (emulator-only credentials). Playwright starts or reuses the Auth emulator and seeds it in `e2e/global_setup.ts`; the emulator port is shared by concurrent runs, which only read the seeded user. Spanner: a shared emulator may already be running on `localhost:9010` (REST 9020); use only this app's own ids with `SPANNER_EMULATOR_HOST=localhost:9010 npm run spanner:provision` (project `assignr-helper-local`, instance `local`, database `assignr-helper`), then `SPANNER_PROJECT_ID=assignr-helper-local SPANNER_INSTANCE_ID=local SPANNER_DATABASE_ID=assignr-helper npm --prefix functions run migrate` after `npm run functions:build`. Never touch other apps' databases on the shared emulator.
- **Local tests:** `npm test` can fail to start worker processes on a loaded Windows machine (`spawn UNKNOWN`); `VITEST_MAX_WORKERS=2 npm test` avoids it.
- **Submitting match reports to Assignr** is blocked on Assignr confirming a supported way to submit reports (the documented `POST /game_reports` is deprecated, and there is no card endpoint). Reports are captured locally; `ProviderCapability.MATCH_REPORT_SUBMIT` is intentionally absent for Assignr.
- **Library gaps** (designed as `LOCAL GAP` frames in Figma, swapped for library components when released): score stepper #991, big numpad #992, choice tiles #993, grouped agenda list #994, share-link manager #995. Also core-server #988 (share links) and #990 (durable offline idempotency stores).

Figma library gaps found while designing the screens (also in the same repo): page-container slot #1010, dialog body slot #1011, touch-sized controls #1012, status-chip tones #1013, filter-bar/skeleton/input sizing #1014, connected-integrations detail #1015, bottom sheet and date range picker #1016, composable app shell #1017, tabular numerals/card colours/map/icons #1018. Fixed-size tables are tracked in #904 (comment added).

Until #1010 ships, designs use `hch-card` as the page wrapper in places (games, quick link, match report) and an edited `hch-page-container` in others; align them when the slot exists.

Upstream issues live in `Hamble-Creek-Holdings-LLC/hamble-creek-holdings` (#986 to #996 for framework gaps). Never edit that repo from here; file an issue instead.

## Figma

Designs: https://www.figma.com/design/AcoMXggIJWBfqpdrcG16CX (file key `AcoMXggIJWBfqpdrcG16CX`). Library: HCH Component Library, file key `jBD5CDQSFzFY0GK4YxzxZx`, library key in the plan. Always instance library components; never detach.

## Conventions worth repeating

- snake_case for variables, methods, properties and files; PascalCase classes; `I`-prefixed interfaces; UPPER_SNAKE enum members. One entity per file. Enums, never string unions.
- Dates are UTC milliseconds. Calendar dates (e.g. `games.local_date`) are UTC-midnight milliseconds, rendered with `UserDateFormat.CALENDAR_DATE`.
- Every tenant-owned row has `tenant_id` and every query filters on it. Audit columns on every table. Secrets only in Secret Manager.
- A `catch` that sets a generic message must also `console.error` the real error.
