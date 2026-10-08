import { IStoredEmailSettings } from '../models/stored_email_settings.model.js';
import { IEmailSettingsView } from './email_settings_view.model.js';

/**
 * Projects stored settings to their API shape, leaving the API key out by construction: each
 * field is copied by name, so a field added to the stored model can never leak by accident.
 * @param settings Stored settings, or null when email is not configured.
 * @returns The view.
 */
export function to_email_settings_view(settings: IStoredEmailSettings | null): IEmailSettingsView {
  if (settings === null) {
    return {
      configured: false,
      from_email: null,
      from_name: null,
      reply_to: null,
      postal_address: null,
    };
  }
  return {
    configured: true,
    from_email: settings.from_email,
    from_name: settings.from_name,
    reply_to: settings.reply_to,
    postal_address: settings.postal_address,
  };
}
