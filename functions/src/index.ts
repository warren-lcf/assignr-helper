import { initializeApp } from 'firebase-admin/app';
import { onRequest } from 'firebase-functions/v2/https';
import { create_app } from './app.js';

initializeApp();

/**
 * The single HTTPS function serving every `/api/**` route. Hosting rewrites
 * `/api/**` to it; the browser never calls a vendor API directly.
 */
export const assignr_helper_api = onRequest({ memory: '512MiB', region: 'us-east4' }, create_app());
