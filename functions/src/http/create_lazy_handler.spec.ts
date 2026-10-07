import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { create_lazy_handler, type LazyRequestHandler } from './create_lazy_handler.js';

function make_response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return { res: { status } as unknown as Response, status, json };
}

describe('create_lazy_handler', () => {
  it('does not build anything until the first request', () => {
    const factory = vi.fn<() => LazyRequestHandler>();

    create_lazy_handler(factory);

    expect(factory).not.toHaveBeenCalled();
  });

  it('builds once and delegates every request to the built handler', () => {
    const inner = vi.fn();
    const factory = vi.fn(() => inner as unknown as LazyRequestHandler);
    const handler = create_lazy_handler(factory);
    const { res } = make_response();

    handler({} as Request, res);
    handler({} as Request, res);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(inner).toHaveBeenCalledTimes(2);
    expect(inner).toHaveBeenCalledWith({}, res);
  });

  it('answers 500 and logs the real error when the build fails, then retries next time', () => {
    const error_spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const inner = vi.fn();
    const factory = vi
      .fn<() => LazyRequestHandler>()
      .mockImplementationOnce(() => {
        throw new Error('Missing required environment variable X');
      })
      .mockImplementation(() => inner as unknown as LazyRequestHandler);
    const handler = create_lazy_handler(factory);
    const first = make_response();

    handler({} as Request, first.res);

    expect(first.status).toHaveBeenCalledWith(500);
    expect(first.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SERVER_MISCONFIGURED' }),
    );
    expect(JSON.stringify(first.json.mock.calls)).not.toContain('environment variable');
    expect(error_spy).toHaveBeenCalledWith(expect.any(String), expect.any(Error));

    handler({} as Request, make_response().res);
    expect(inner).toHaveBeenCalledTimes(1);
    error_spy.mockRestore();
  });
});
