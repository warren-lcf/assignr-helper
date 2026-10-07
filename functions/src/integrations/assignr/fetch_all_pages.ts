import { AssignrHttpClient } from './assignr_http_client.js';

/** Page size Assignr allows on list endpoints. */
const PAGE_SIZE = 50;

/** Safety stop so a malformed `next_page` can never loop forever. */
const MAX_PAGES = 200;

/**
 * Reads every page of an Assignr list endpoint and returns the embedded items.
 * @param client HTTP client.
 * @param path List endpoint path.
 * @param access_token Bearer token.
 * @param query Extra query parameters (filters, sort).
 * @param embedded_key Key under `_embedded` holding the items, e.g. `games`.
 * @returns Every item across all pages, in order.
 */
export async function fetch_all_pages(
  client: AssignrHttpClient,
  path: string,
  access_token: string,
  query: Record<string, string>,
  embedded_key: string,
): Promise<unknown[]> {
  const items: unknown[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = await client.get_json(path, access_token, {
      ...query,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    const record = (body ?? {}) as Record<string, unknown>;
    const embedded = (record['_embedded'] ?? {}) as Record<string, unknown>;
    const page_items = embedded[embedded_key];
    if (Array.isArray(page_items)) items.push(...page_items);

    const page_info = (record['page'] ?? {}) as Record<string, unknown>;
    const next_page = page_info['next_page'];
    if (next_page === null || next_page === undefined || next_page === false) return items;
  }
  return items;
}
