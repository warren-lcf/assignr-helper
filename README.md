# Assignr Helper

A referee's helper for scheduling work across several assignors. Assignr is the first integration; the backend is vendor-neutral.

See [CLAUDE.md](CLAUDE.md) for architecture, commands, blocked work and conventions.

## Getting started

```bash
nvm use            # Node 22
npm install
npm --prefix functions install
npm start          # Angular dev server on http://localhost:4200
```

Installing `@hch-shared-libraries/*` needs Artifact Registry access; see the blocked-work list in CLAUDE.md.

## Layout

- `src/`: Angular app (`src/app/{core,shared,features}`)
- `functions/`: Firebase Functions API, provider port, migrations (`functions/migrations`)
- `e2e/`: Playwright specs and layout-check helpers
- `firebase.json`, `cloudbuild.yaml`: hosting, functions and the deploy pipeline
