import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { apply_public_headers } from './apply_public_headers.js';

describe('apply_public_headers', () => {
  it('sets the four headers and continues', () => {
    const setHeader = vi.fn();
    const next = vi.fn() as unknown as NextFunction;

    apply_public_headers({} as Request, { setHeader } as unknown as Response, next);

    expect(setHeader.mock.calls).toEqual([
      ['Cache-Control', 'no-store'],
      ['Referrer-Policy', 'no-referrer'],
      ['X-Robots-Tag', 'noindex, nofollow'],
      ['X-Content-Type-Options', 'nosniff'],
    ]);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
