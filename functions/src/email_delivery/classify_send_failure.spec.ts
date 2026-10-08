import { describe, expect, it } from 'vitest';
import { classify_send_failure } from './classify_send_failure.js';
import { DeliveryErrorCode } from './enums/delivery_error_code.enum.js';

describe('classify_send_failure', () => {
  it.each([
    [400, DeliveryErrorCode.PROVIDER_REJECTED],
    [413, DeliveryErrorCode.PROVIDER_REJECTED],
    [401, DeliveryErrorCode.PROVIDER_AUTH],
    [403, DeliveryErrorCode.PROVIDER_AUTH],
    [429, DeliveryErrorCode.PROVIDER_RATE_LIMITED],
    [500, DeliveryErrorCode.PROVIDER_UNAVAILABLE],
    [503, DeliveryErrorCode.PROVIDER_UNAVAILABLE],
    [null, DeliveryErrorCode.PROVIDER_UNAVAILABLE],
    [302, DeliveryErrorCode.UNKNOWN],
  ])('maps the vendor status %s to %s', (status_code, expected) => {
    expect(classify_send_failure({ status_code })).toBe(expected);
  });

  it.each([new Error('boom'), 'text', undefined, null, { status_code: 'x' }, {}])(
    'treats %j as unknown',
    (error) => {
      expect(classify_send_failure(error)).toBe(DeliveryErrorCode.UNKNOWN);
    },
  );

  it('never reads the error message', () => {
    const code = classify_send_failure(
      Object.assign(new Error('rejected sam@example.com'), { status_code: 400 }),
    );

    expect(code).toBe(DeliveryErrorCode.PROVIDER_REJECTED);
  });
});
