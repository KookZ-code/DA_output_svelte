import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mwGet, MiddlewareError } from '$lib/server/middleware';
import { parsePkgFilter, resolveShift } from '$lib/server/handler-utils';
import { fetchWip, planPerShift, emptyWip } from '$lib/server/wip';
import type { SummaryResponse } from '$lib/types/dashboard';

// Raw summary numbers from the API center (plan overlay is applied below).
interface MwSummary {
  total_bonded: number;
  active_machines: number;
  active_operators: number;
}

export const GET: RequestHandler = async ({ url }) => {
  const { date, shift, window: w } = resolveShift(url);
  const pkgFilter = parsePkgFilter(url);
  const packages = pkgFilter.length ? pkgFilter.join(',') : undefined;

  let data: MwSummary;
  try {
    data = await mwGet<MwSummary>('/api/v1/da-uph/summary', { date, shift, packages });
  } catch (e) {
    error(e instanceof MiddlewareError ? 502 : 500, e instanceof Error ? e.message : String(e));
  }

  // Daily total = this shift + the other shift of the same date.
  const otherShift = shift === 'D' ? 'N' : 'D';
  let otherBonded = 0;
  try {
    otherBonded = (await mwGet<MwSummary>('/api/v1/da-uph/summary', { date, shift: otherShift, packages }))
      .total_bonded;
  } catch {
    // non-fatal — daily total degrades to this shift only
  }
  const daily_bonded = data.total_bonded + otherBonded;

  // Target shift total — from A01 plan (per-day Plan ÷ 2). Unfiltered = sum over all
  // A01 packages; filtered = sum of the selected packages' per-shift plan.
  const wip = await fetchWip().catch(() => emptyWip());
  const targetShift =
    pkgFilter.length === 0
      ? wip.totalPlanPerShift
      : pkgFilter.reduce((s, pkg) => s + (planPerShift(pkg, wip) ?? 0), 0);

  const achievementPct = targetShift > 0 ? (data.total_bonded / targetShift) * 100 : 0;

  const body: SummaryResponse = {
    date,
    shift,
    shift_label: w.label,
    window_start: w.start,
    window_end: w.end,
    total_bonded: data.total_bonded,
    target_shift: targetShift,
    achievement_pct: achievementPct,
    active_machines: data.active_machines,
    active_operators: data.active_operators,
    daily_bonded,
  };
  return json(body);
};
