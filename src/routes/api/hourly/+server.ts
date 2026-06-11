import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mwGet, MiddlewareError } from '$lib/server/middleware';
import { parsePkgFilter, resolveShift } from '$lib/server/handler-utils';
import { fetchWip, planPerShift, emptyWip } from '$lib/server/wip';
import { hourLabel } from '$lib/server/shift';
import type { HourlyResponse } from '$lib/types/dashboard';

export const GET: RequestHandler = async ({ url }) => {
  const { date, shift, window: w } = resolveShift(url);
  const pkgFilter = parsePkgFilter(url);
  const packages = pkgFilter.length ? pkgFilter.join(',') : undefined;

  let mw: { packages: Record<string, number[]> };
  try {
    mw = await mwGet<{ packages: Record<string, number[]> }>('/api/v1/da-uph/hourly', {
      date,
      shift,
      packages,
    });
  } catch (e) {
    error(e instanceof MiddlewareError ? 502 : 500, e instanceof Error ? e.message : String(e));
  }

  const n = w.hours.length;
  // Shift target from A01 plan (per-day Plan ÷ 2): unfiltered = sum over all A01
  // packages; filtered = sum of the selected packages' per-shift plan.
  const wip = await fetchWip().catch(() => emptyWip());
  const totalTarget =
    pkgFilter.length === 0
      ? wip.totalPlanPerShift
      : pkgFilter.reduce((s, pkg) => s + (planPerShift(pkg, wip) ?? 0), 0);

  const targetCumulative = Array.from({ length: n }, (_, i) =>
    Math.trunc((totalTarget * (i + 1)) / n)
  );
  const hours = w.hours.map(hourLabel);

  const body: HourlyResponse = { hours, target_cumulative: targetCumulative, packages: mw.packages };
  return json(body);
};
