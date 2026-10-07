import { describe, expect, it, vi } from 'vitest';
import { AssignrHttpClient } from './assignr_http_client.js';
import { AssignrRateBudget } from './assignr_rate_budget.js';
import { fetch_all_pages } from './fetch_all_pages.js';

function make_client(pages: unknown[]) {
  const fetch_impl = vi.fn(async () => new Response(JSON.stringify(pages.shift())));
  let clock = 1;
  const client = new AssignrHttpClient({
    rate_budget: new AssignrRateBudget({
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    }),
    fetch_impl: fetch_impl as unknown as typeof fetch,
  });
  return { client, fetch_impl };
}

describe('fetch_all_pages', () => {
  it('collects items across pages until next_page is null', async () => {
    const { client, fetch_impl } = make_client([
      { _embedded: { games: [{ id: 1 }, { id: 2 }] }, page: { next_page: 2 } },
      { _embedded: { games: [{ id: 3 }] }, page: { next_page: null } },
    ]);

    const items = await fetch_all_pages(client, '/g', 'tok', { 'search[x]': '1' }, 'games');

    expect(items).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    const urls = fetch_impl.mock.calls.map((call) => String((call as unknown[])[0]));
    expect(urls[0]).toContain('page=1');
    expect(urls[0]).toContain('limit=50');
    expect(urls[1]).toContain('page=2');
  });

  it('returns nothing for an empty result with no embedded key', async () => {
    const { client } = make_client([{ page: { next_page: null } }]);

    expect(await fetch_all_pages(client, '/g', 'tok', {}, 'games')).toEqual([]);
  });

  it('tolerates a missing page object', async () => {
    const { client } = make_client([{ _embedded: { games: [{ id: 1 }] } }]);

    expect(await fetch_all_pages(client, '/g', 'tok', {}, 'games')).toEqual([{ id: 1 }]);
  });

  it('stops at the page cap if next_page never clears', async () => {
    const endless = Array.from({ length: 205 }, () => ({
      _embedded: { games: [{ id: 1 }] },
      page: { next_page: 1 },
    }));
    const { client, fetch_impl } = make_client(endless);

    const items = await fetch_all_pages(client, '/g', 'tok', {}, 'games');

    expect(items).toHaveLength(200);
    expect(fetch_impl).toHaveBeenCalledTimes(200);
  });
});
