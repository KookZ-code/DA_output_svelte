import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mwGet, MiddlewareError } from '$lib/server/middleware';
import { resolveShift } from '$lib/server/handler-utils';
import { fetchWip, planPerShift, emptyWip } from '$lib/server/wip';
import { fetchDaReport, normId, type DaReportMachine } from '$lib/server/daReport';

// Raw per-machine rows from the API center. UPH target comes from the API center
// (A01 has no UPH target); plan target/% are derived from A01's per-shift plan.
interface MwMachine {
  machine_id: string;
  badge_no: string;
  uph: number;
  bonded_unit: number;
  last_scan_ts: string | null;
  pkg_mpc: string;
  target_uph?: number; // per-machine UPH target from the API center (0 when absent)
}

// ─────────────────────────────────────────────────────────────────────────
export const GET: RequestHandler = async ({ url }) => {
  const { date, shift, window: w } = resolveShift(url);

  const pkg = url.searchParams.get('package');
  if (!pkg) error(400, 'Missing required query param: package');

  const hourParam = url.searchParams.get('hour');
  const hour =
    hourParam && /^\d+$/.test(hourParam) ? Number(hourParam) : (w.hours[w.hours.length - 1] ?? 18);

  try {
    // Raw machine rows + DA Report overlay + A01 plan, in parallel.
    const [rows, daMap, wip] = await Promise.all([
      mwGet<MwMachine[]>('/api/v1/da-uph/machines', { date, shift, hour: String(hour), package: pkg }),
      fetchDaReport(date, shift).catch(() => new Map<string, DaReportMachine>()),
      fetchWip().catch(() => emptyWip()),
    ]);

    const planShift = planPerShift(pkg, wip) ?? 0;
    const shiftHours = w.hours.length;
    const slotIdx = Math.max(0, w.hours.indexOf(hour));
    const hourFraction = (slotIdx + 1) / shiftHours;

    // Merge utilisation + events + per-row UPH target (from the API center) into each row.
    const mergedBase = rows.map((r) => ({
      machine_id: r.machine_id,
      badge_no: r.badge_no,
      target_uph: r.target_uph ?? 0,
      uph: r.uph,
      bonded_unit: r.bonded_unit,
      last_scan_ts: r.last_scan_ts,
      util_pct: daMap.get(normId(r.machine_id))?.util_pct ?? null,
      events: daMap.get(normId(r.machine_id))?.events ?? [],
    }));

    // Package-level UPH target for the machine count = the largest per-machine target.
    const pkgUphTarget = mergedBase.reduce((m, r) => Math.max(m, r.target_uph), 0);
    const required_mc =
      pkgUphTarget > 0 && planShift > 0 ? Math.ceil(planShift / (pkgUphTarget * shiftHours)) : 0;
    const target_bonded = Math.trunc(planShift * hourFraction);

    // vs_output_pct = (output - expected_per_machine) / expected_per_machine
    const expectedPerMachine =
      target_bonded > 0 && mergedBase.length > 0
        ? Math.trunc(target_bonded / mergedBase.length)
        : 0;
    const merged = mergedBase.map((r) => ({
      ...r,
      vs_output_pct:
        expectedPerMachine > 0
          ? ((r.bonded_unit - expectedPerMachine) / expectedPerMachine) * 100
          : 0,
    }));

    return json({ rows: merged, required_mc, target_bonded });
  } catch (e) {
    if (e instanceof MiddlewareError) error(502, e.message);
    error(503, `API error: ${e instanceof Error ? e.message : String(e)}`);
  }
};
