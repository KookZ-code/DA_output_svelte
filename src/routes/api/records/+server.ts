import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mwGet, MiddlewareError } from '$lib/server/middleware';
import { resolveShift } from '$lib/server/handler-utils';
import type { RecordsResponse } from '$lib/types/dashboard';

export const GET: RequestHandler = async ({ url }) => {
  const { date, shift } = resolveShift(url);

  const machineId = url.searchParams.get('machine_id');
  const pkg = url.searchParams.get('package');
  if (!machineId) error(400, 'Missing required query param: machine_id');
  if (!pkg) error(400, 'Missing required query param: package');

  try {
    // Fully plan-independent — the API returns { current, prev_tail } directly.
    const data = await mwGet<RecordsResponse>('/api/v1/da-uph/records', {
      date,
      shift,
      machine_id: machineId,
      package: pkg,
    });
    return json(data);
  } catch (e) {
    if (e instanceof MiddlewareError) error(502, e.message);
    error(503, `API error: ${e instanceof Error ? e.message : String(e)}`);
  }
};
