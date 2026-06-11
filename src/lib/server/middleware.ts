// Server-only fetch wrapper for the Rust API center (Dashboad_API_rush).
// $lib/server/* is treated as server-only by SvelteKit, so the API key / base URL
// never reach the browser. Replaces the former direct better-sqlite3 access — the
// API center now owns the central.db hourly-UPH queries (/api/v1/da-uph/*).

import { env } from '$env/dynamic/private';

function getBase()    { return (env.API_BASE_URL ?? 'http://localhost:8080').replace(/\/$/, ''); }
function getApiKey()  { return env.API_KEY ?? ''; }
function getTimeout() { return Number(env.API_TIMEOUT ?? 10000); }

export class MiddlewareError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** GET the API center. Returns `body.data` or throws `MiddlewareError`.
 *  The Rust API wraps responses as { data: T, error: null } on success and
 *  { data: null, error: { code, message } } on failure. */
export async function mwGet<T>(
  path: string,
  params?: Record<string, string | string[] | undefined>
): Promise<T> {
  const url = new URL(`${getBase()}${path}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined) continue;
      if (Array.isArray(v)) v.forEach((i) => url.searchParams.append(k, i));
      else url.searchParams.set(k, v);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getTimeout());

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { 'X-API-Key': getApiKey() },
      signal: controller.signal,
    });
  } catch (err) {
    throw new MiddlewareError('NETWORK_ERROR', err instanceof Error ? err.message : 'Network error');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new MiddlewareError('HTTP_ERROR', `API center returned ${res.status}`);
  }

  const body = (await res.json()) as { data: T | null; error: { code: string; message: string } | null };

  if (body.error !== null) {
    const e = body.error;
    throw new MiddlewareError(e?.code ?? 'API_ERROR', e?.message ?? 'Unknown API error');
  }

  return body.data as T;
}
