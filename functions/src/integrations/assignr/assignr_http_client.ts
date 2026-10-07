import { AssignrRateBudget } from './assignr_rate_budget.js';
import { AssignrApiError } from './errors/assignr_api_error.js';
import { AssignrAuthError } from './errors/assignr_auth_error.js';
import { AssignrConflictError } from './errors/assignr_conflict_error.js';
import { AssignrRateLimitError } from './errors/assignr_rate_limit_error.js';

/** Production API base. No sandbox is documented. */
export const ASSIGNR_API_BASE_URL = 'https://api.assignr.com/api/v2';

/** Media type every request must accept. */
export const ASSIGNR_ACCEPT_HEADER = 'application/vnd.assignr.v2.hal+json';

/**
 * Encoding used for write bodies. The docs show form-encoded parameters but also
 * name the HAL media type for POSTs, so this is the single place to change once
 * verified against the live API.
 */
export const ASSIGNR_WRITE_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/** Longest single wait the client will honour from a rate-limit header. */
const MAX_RETRY_WAIT_MS = 60_000;

/** Construction options; every dependency is injectable for tests. */
export interface IAssignrHttpClientOptions {
  rate_budget: AssignrRateBudget;
  base_url?: string;
  /** Defaults to the global `fetch`, bound so it keeps its required receiver. */
  fetch_impl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Retries for 429 and 503 responses before giving up. */
  max_retries?: number;
}

/**
 * Thin HTTP layer for the Assignr API: auth and media-type headers, the rate
 * budget, bounded retries for 429/503, and typed errors. It returns parsed JSON
 * and leaves interpretation to the provider.
 */
export class AssignrHttpClient {
  private readonly base_url: string;
  private readonly fetch_impl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly max_retries: number;
  private readonly rate_budget: AssignrRateBudget;

  public constructor(options: IAssignrHttpClientOptions) {
    this.rate_budget = options.rate_budget;
    this.base_url = (options.base_url ?? ASSIGNR_API_BASE_URL).replace(/\/+$/, '');
    this.fetch_impl = options.fetch_impl ?? fetch.bind(globalThis);
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.max_retries = options.max_retries ?? 3;
  }

  /**
   * Sends a GET and returns the parsed body.
   * @param path API path starting with `/`, or an absolute `https:` URL from a HAL link.
   * @param access_token Bearer token.
   * @param query Query parameters.
   * @returns Parsed JSON body.
   */
  public async get_json(
    path: string,
    access_token: string,
    query: Record<string, string> = {},
  ): Promise<unknown> {
    return this.send('GET', this.build_url(path, query), access_token, null);
  }

  /**
   * Sends a form-encoded POST and returns the parsed body (null for an empty body).
   * @param path API path starting with `/`.
   * @param access_token Bearer token.
   * @param body Form fields.
   * @returns Parsed JSON body, or null when the response has none.
   */
  public async post_form(
    path: string,
    access_token: string,
    body: Record<string, string>,
  ): Promise<unknown> {
    return this.send('POST', this.build_url(path, {}), access_token, new URLSearchParams(body));
  }

  private build_url(path: string, query: Record<string, string>): string {
    const url = new URL(path.startsWith('https://') ? path : `${this.base_url}${path}`);
    if (url.origin !== new URL(this.base_url).origin) {
      throw new Error(`Refusing to call a host other than ${new URL(this.base_url).origin}`);
    }
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return url.toString();
  }

  private async send(
    method: 'GET' | 'POST',
    url: string,
    access_token: string,
    body: URLSearchParams | null,
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${access_token}`,
      Accept: ASSIGNR_ACCEPT_HEADER,
    };
    if (body) headers['Content-Type'] = ASSIGNR_WRITE_CONTENT_TYPE;

    for (let attempt = 0; ; attempt++) {
      await this.rate_budget.acquire();
      const response = await this.fetch_impl(url, { method, headers, body });
      this.rate_budget.observe(response.headers);
      const parsed = await this.parse_body(response);

      if (response.ok) return parsed;

      const retryable = response.status === 429 || response.status === 503;
      if (retryable && attempt < this.max_retries) {
        const wait_ms = this.retry_wait_ms(response, attempt);
        if (response.status === 429) this.rate_budget.block_for(wait_ms);
        await this.sleep(wait_ms);
        continue;
      }
      throw this.to_error(response, parsed);
    }
  }

  private retry_wait_ms(response: Response, attempt: number): number {
    const reset_seconds = Number(response.headers.get('x-ratelimit-reset-seconds-remaining'));
    const from_header =
      Number.isFinite(reset_seconds) && reset_seconds > 0 ? reset_seconds * 1000 : 0;
    const backoff = 1000 * 2 ** attempt;
    return Math.min(MAX_RETRY_WAIT_MS, Math.max(from_header, backoff));
  }

  private async parse_body(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private to_error(response: Response, body: unknown): AssignrApiError {
    const detail =
      typeof body === 'object' && body !== null
        ? String(
            (body as Record<string, unknown>)['message'] ??
              (body as Record<string, unknown>)['error'] ??
              '',
          )
        : '';
    const message = `Assignr API ${response.status}${detail ? `: ${detail}` : ''}`;
    if (response.status === 401) return new AssignrAuthError(message, body);
    if (response.status === 409) return new AssignrConflictError(message, body);
    if (response.status === 429) {
      return new AssignrRateLimitError(
        message,
        body,
        this.retry_wait_ms(response, this.max_retries),
      );
    }
    return new AssignrApiError(message, response.status, body);
  }
}
