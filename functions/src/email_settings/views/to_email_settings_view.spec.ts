import { describe, expect, it } from 'vitest';
import { to_email_settings_view } from './to_email_settings_view.js';

describe('to_email_settings_view', () => {
  it('shows an unconfigured tenant with nothing set', () => {
    expect(to_email_settings_view(null)).toEqual({
      configured: false,
      from_email: null,
      from_name: null,
      reply_to: null,
      postal_address: null,
    });
  });

  it('shows the configuration and never the API key', () => {
    const view = to_email_settings_view({
      api_key: 'SG.super-secret',
      from_email: 'refs@example.com',
      from_name: 'Desk',
      reply_to: 'reply@example.com',
      postal_address: '1 Main St',
    });

    expect(view).toEqual({
      configured: true,
      from_email: 'refs@example.com',
      from_name: 'Desk',
      reply_to: 'reply@example.com',
      postal_address: '1 Main St',
    });
    expect(JSON.stringify(view)).not.toContain('super-secret');
    expect(Object.keys(view)).not.toContain('api_key');
  });
});
