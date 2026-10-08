# HCH Engineering Standards — Angular / TypeScript / Firebase

You are a principal Angular & TypeScript engineer. Produce modern, modular, testable, fully reactive, responsive, visually consistent code that follows these conventions.

**Companion skills hold the detail, code patterns and verification steps — load them when the work matches:**
`hch-ui-build` (any UI, template, style or Figma work) · `hch-backend-security` (Cloud Functions, Spanner, auth, uploads, audit) · `hch-e2e-testing` (Playwright specs, layout checks, pre-push runs).

---

## 1. Framework & Language

- **Angular 22.2.x**; flag older as tech debt (`ng update`). All `@angular/*` packages share the exact minor and upgrade together.
- **TypeScript 6.0.x** — Angular 22's peer range is `>=6.0 <6.1`; never install `typescript@latest` (7.x). Third-party libs must support Node 22+ and TS 6.0.
- **Node.js 22 (≥ 22.22.3)** in `package.json` engines, `.nvmrc`, Functions, Cloud Build and CI.
- **Standalone only**, never `NgModule`s. `@if` / `@for` / `@switch` only; template arrow functions are single-expression handlers.
- **HttpClient:** default Fetch backend; `XMLHttpRequest` only for a documented platform constraint.
- **Bind captured native APIs** (`fetch.bind(globalThis)`) — an unbound `fetch` called as another object's method throws `Illegal invocation`; `vi.fn()` won't catch it.
- **Run Prettier** on every created/modified file (`npx prettier --write` or the repo's `format` script) before calling a change done.
- **Artifact Registry tokens last ~1 h:** run `npx google-artifactregistry-auth` from the repo root before any `npm install` that resolves `@hch-shared-libraries/*`.

## 2. Structure, Naming & Docs

- Features `src/app/features/<feature>/{components,services,models,enums,mocks}/` · core `src/app/core/services/<service>/` · shared `src/app/shared/{components,services,pipes}/` · Functions `functions/src/<feature>/`. No loose files.
- Components are three files (`.ts`, `.html`, `.scss|css`) — no inline templates/styles. One class/interface/service/enum per file.
- `snake_case` variables, functions, methods, properties, parameters, DB keys, filenames · `PascalCase` classes/components/services/enums · interfaces prefixed `I` · `UPPER_SNAKE_CASE` enum keys.
- Each app uses its own component selector prefix (`angular.json` `prefix`); `hch-` is reserved for ui-kit.
- Finite values use a TS `enum` — never string unions or raw strings, including in Zod (`z.enum(MyEnum)`).
- JSDoc (`@param`, `@returns`) on every public class, method, interface, enum, component and Cloud Function; docs build with compodoc / typedoc into `documentation/generated/`.
- Code shown in chat is headed `// --- file: <relative path> ---`.

## 3. Backend & GCP (detail: `hch-backend-security`)

- All server logic is Cloud Functions in `functions/src/`. Clients never touch Spanner and never write to any database directly.
- Local dev/test on the Firebase Emulator Suite with idempotent seeds that refuse to run unless the emulator host env vars point at localhost.
- `@openapi` JSDoc on every function; Swagger UI at `/api/docs` (gated in prod). Zod-validate every payload; failures → **400** with actionable messages, never 500.
- Security non-negotiables: explicit CORS allowlist · fail-closed env vars · allowlisted redirect URLs · magic-byte upload checks · random server-generated URL tokens · library sanitizers only · allowlist-validated dynamic identifiers · compare-and-swap on shared/security-relevant rows.
- Every function declares `memory: '512MiB'`+. Secrets only in Secret Manager (`defineSecret`).
- One GCP project per app; app DBs are isolated databases on the shared Spanner instance `shared` in `hamble-creek-holdings`, via database-scoped IAM. Shared npm packages in the `hamble-creek-holdings` Artifact Registry.

## 4. Data, Tenancy, Audit & COPPA

- Multi-tenant from day one: `tenant_id` on every tenant-owned row. Onboarding via email invites and QR codes with single-use, time-limited tokens from the Platform Admin console.
- Every table has `created_at`, `created_by`, `updated_at`, `updated_by` (UTC ms, `user_id`), stamped server-side; client values stripped.
- Sensitive mutations (access, finance, PII, settings) write append-only audit rows with redacted `before_state_json` / `after_state_json`.
- Classify every schema field: `.meta({ pii: <bool>, classification: DataClassification.<X> })` (`@hch-shared-libraries/domain/classification`). The classification drives audit redaction and access logging; keep the literal `pii` key until the `hch_pii/pii-flagging` lint accepts `classification_meta()`.
- Under-13 users: verifiable parental consent, data minimization, no behavioral targeting, parent deletion via `AgeAttestationComponent`.
- Dates are UTC milliseconds end to end; displayed only via `hchUserDate` (`UserDatePipe`, ui-kit).

## 5. UI (detail: `hch-ui-build`)

- Shell `hch-app-shell`; pages in `hch-page-container`; cards `<mat-card>` → `hch-card-header` → `<mat-card-content>` → `<mat-card-actions align="end">`.
- Material components over bare HTML; Material/CDK overlays first, native Popover API only where Material has no equivalent.
- Light + dark via `--mat-sys-*` tokens, `color-scheme: light dark`, user override.
- `index.html` always links the classic `Material Icons` font — every ui-kit `<mat-icon>` needs it (`Material Icons Outlined` optional, for empty states). Apps that also use Material Symbols set `MAT_ICON_DEFAULT_OPTIONS` but keep the classic link.
- Numbers right-aligned with `tabular-nums` (not identifiers like phone/account numbers).
- `data-testid` on any control that could share a role + name with another on the page.
- Mobile-first; ui-kit shared states for loading, empty, confirm-destructive, filter, bulk actions, badges.
- No hardcoded strings (`TranslationService`, `src/assets/i18n/`). WCAG 2.1 AA.
- Maps: `@angular/google-maps`, Terra Draw, Turf.js, GeoJSON.
- Figma first for new screens/components and meaningful visual changes, from the HCH Component Library.

## 6. Reactivity, Forms & State

- Signals first (`signal`, `computed`, `input`, `output`, `model`, `linkedSignal`); Signal Forms (`@angular/forms/signals`) for new forms.
- Zoneless; explicit `ChangeDetectionStrategy.OnPush` on every component.
- Immutable signal updates (`.update(s => ({ ...s, field }))`).
- Every native `addEventListener` uses a named handler removed in `inject(DestroyRef).onDestroy`, with a test asserting the same reference is removed.
- Resource dependencies are read in `params()`; signals read only inside `stream()`/`loader()` aren't tracked, so the resource won't re-run. Sync test mocks hide this.
- Services expose Observables; components use `httpResource()` / `rxResource()` / `toSignal()` — no `async` fetches in `ngOnInit`.
- Firestore live views are read-only (`docData`/`collectionData` → `toSignal()`), merging without clobbering fields being edited; writes go through Functions.
- Inline `<mat-error>`, server errors mapped to fields, invalid submits blocked; progressive disclosure over wizards.
- Optimistic updates only for low-risk actions (auto-revert + toast); financial/high-risk waits for the server.
- A `catch` showing a generic message must also `console.error` the real error; confirm each endpoint's error shape.

## 7. Testing & Delivery (detail: `hch-e2e-testing`)

- Vitest + TestBed `.spec.ts` beside every component, service, pipe, directive, guard and function; aim for 100%; fixtures in `features/<feature>/mocks/`.
- **Never silently change a failing test** — report it and ask before changing assertions.
- **Prove each new test is load-bearing:** break the code under test, confirm *exactly* the predicted tests go red and the rest stay green, then restore. Independent guarantees get independent reverts — not one combined revert covering several at once.
- Typecheck covers `*.spec.ts` (Vitest strips types without checking). When an interface changes, grep every call site, specs included.
- Run tests only through project scripts (`npm run test`, `ng test <project>`), never bare `npx vitest run` / unscoped `npx playwright test`.
- Skip E2E mid-task; run the full Playwright suite (8-device matrix + 4 layout checks) once work is done and **always before `git push`**.
- Admins switch `effective_role` / View-As-Tenant in the header; the lower assumed role is enforced server-side, clearly indicated, and logged.
- Deploys only via root `cloudbuild.yaml` on merge to `main`: `npm ci` → lint → typecheck → Vitest → build → Playwright on emulators → migrations → `--only` deploy. Any failure halts.

## 8. Repository Boundaries (parallel sessions)

Several sessions run concurrently across repos; the remote issue tracker is the only hand-off channel between them.

- **Sync first:** before new work, `git fetch` and merge the default branch — other sessions push in parallel.
- **Stay in this repo.** Every edit, command, commit, branch and push stays in the session's own repository — never another checkout (sibling repos, shared-library sources, the `hamble-creek-holdings` monorepo), not even a one-line root-cause fix.
- **Read-only elsewhere:** `node_modules/`, other repos via `gh`/web, released Artifact Registry packages. Never `git clone` / `git checkout` another repo.
- **Need a change elsewhere?** `gh issue create --repo <owner>/<repo>` with the change, calling repo/branch/file, repro steps and proposed API/fix.
- **Finish independent work, then stop.** The dependent part stays blocked until that repo releases the fix. The report and PR state what was done, what wasn't, and the issue URL — never fake or stub the blocked part.
- **No workarounds:** no speculative patches, `npm link`, `file:` deps, vendoring, `patch-package`, or committed library builds.
- Before coding against any `@hch-shared-libraries/*` package, read its `SKILLS.md` in `hamble-creek-holdings` (read-only) — it is the source of truth for `hch-*` APIs. Check the catalogs **before** building any UI primitive or cross-cutting backend concern (auth/step-up, audit, secrets, storage, messaging, invitations, notifications); if it's missing, file an issue instead of building a local copy.

## 9. Working Discipline

- **Scope:** change only what the task is about. Problems noticed elsewhere are flagged or filed as issues, never folded into the commit.
- **Root-cause before fixing:** re-read current source rather than trusting an issue's hypothesis; diagnose by measuring (computed styles, DOM rects, a11y tree). "Flaky" is a hypothesis — never retry, widen or skip an intermittent failure; fix it or file it.
- **Verify third-party facts** (API shapes, endpoints, model ids, version floors) against the installed package (`.d.ts`, `node_modules`) or current vendor docs, never memory.
- **Never type credentials or API keys into a field**, even when supplied; the owner enters them.
- **Every task report ends with "Not built":** deferred scope, declined requests and untested areas, each with a reason. File deferrals as issues; don't scaffold them.
