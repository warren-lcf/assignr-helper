import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { create_lazy_handler } from './http/create_lazy_handler.js';
import { create_production_app } from './production_app.js';
import { create_production_context } from './production_context.js';
import { run_scheduled_sync } from './sync/scheduled_sync.js';

initializeApp();

/**
 * The single HTTPS function serving every `/api/**` route. Hosting rewrites
 * `/api/**` to it; the browser never calls a vendor API directly. The timeout is 300 seconds
 * (the default is 60) because sending an email draft delivers up to 100 messages inside one
 * request; the send stops delivering after 240 seconds and leaves the rest to a retry. The app is built
 * on the first request because the Firebase CLI imports this module during deploy
 * analysis, before it has applied `functions/.env.<project>`.
 */
export const assignr_helper_api = onRequest(
  { memory: '512MiB', region: 'us-east4', timeoutSeconds: 300 },
  create_lazy_handler(() => create_production_app()),
);

/**
 * Syncs every eligible connection every 15 minutes, least recently synced first.
 * A connection that has lost its credentials is flagged and skipped from then on.
 */
export const sync_connections_job = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: 'us-east4',
    memory: '512MiB',
    timeoutSeconds: 540,
    retryCount: 0,
  },
  async () => {
    await run_scheduled_sync(create_production_context().sync_service);
  },
);
