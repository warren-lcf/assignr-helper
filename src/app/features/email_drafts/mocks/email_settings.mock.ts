import { IEmailSettings } from '../models/email_settings.model';

/** The secret a spec types as the API key. Obviously fake; the screen must never echo it back. */
export const FAKE_API_KEY = 'SG.fake-key-for-specs-0123456789';

/** Settings of a tenant that has set sending up. */
export const CONFIGURED_SETTINGS: IEmailSettings = {
  configured: true,
  from_email: 'games@example.test',
  from_name: 'Metro Referees',
  reply_to: 'help@example.test',
  postal_address: '1 Main St, Springfield',
};

/** Settings of a tenant that has not. */
export const UNCONFIGURED_SETTINGS: IEmailSettings = {
  configured: false,
  from_email: null,
  from_name: null,
  reply_to: null,
  postal_address: null,
};
