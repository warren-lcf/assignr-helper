import { describe, expect, it } from 'vitest';
import { AssignrApiError } from '../integrations/assignr/errors/assignr_api_error.js';
import { AssignrAuthError } from '../integrations/assignr/errors/assignr_auth_error.js';
import { to_sync_run_error } from './to_sync_run_error.js';

describe('to_sync_run_error', () => {
  it('keeps the status of provider API errors and drops the body', () => {
    const error = new AssignrApiError('Assignr API 500', 500, { token: 'secret-token' });

    const summary = to_sync_run_error(error);

    expect(summary).toEqual({ name: 'AssignrApiError', message: 'Assignr API 500', status: 500 });
    expect(JSON.stringify(summary)).not.toContain('secret-token');
  });

  it('reports typed subclasses by their own name', () => {
    expect(to_sync_run_error(new AssignrAuthError('expired', {}))).toMatchObject({
      name: 'AssignrAuthError',
      status: 401,
    });
  });

  it('summarises plain errors without a status', () => {
    expect(to_sync_run_error(new TypeError('bad'))).toEqual({
      name: 'TypeError',
      message: 'bad',
      status: null,
    });
  });

  it('stringifies non-error throwables', () => {
    expect(to_sync_run_error('boom')).toEqual({
      name: 'UnknownError',
      message: 'boom',
      status: null,
    });
  });
});
