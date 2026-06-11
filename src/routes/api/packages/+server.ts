import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mwGet, MiddlewareError } from '$lib/server/middleware';
import {
  fetchWip,
  emptyWip,
  mpcCode,
  planPerShift,
  lookupWip,
  lookupDoi,
  lookupOrder,
  type WipData,
} from '$lib/server/wip';
import { parsePkgFilter, resolveShift } from '$lib/server/handler-utils';
import type { PackageRow } from '$lib/types/dashboard';

// Raw per-pkg_key bonded totals from the API center. Plan/target/% comes from A01.
interface MwPackage {
  package: string;
  bonded: number;
}

export const GET: RequestHandler = async ({ url }) => {
  const { date, shift, window: w } = resolveShift(url);
  const pkgFilter = parsePkgFilter(url);
  const packages = pkgFilter.length ? pkgFilter.join(',') : undefined;

  const hourParam = url.searchParams.get('hour');
  const hour =
    hourParam && /^\d+$/.test(hourParam) ? Number(hourParam) : (w.hours[w.hours.length - 1] ?? 18);
  const slotIdx = Math.max(0, w.hours.indexOf(hour));
  const hourFraction = (slotIdx + 1) / w.hours.length;

  let rows: MwPackage[];
  let wip: WipData;
  try {
    // Raw bonded per package (API center) + A01 WIP/DOI/Plan in parallel.
    [rows, wip] = await Promise.all([
      mwGet<MwPackage[]>('/api/v1/da-uph/packages', { date, shift, hour: String(hour), packages }),
      fetchWip().catch(() => emptyWip()),
    ]);
  } catch (e) {
    error(e instanceof MiddlewareError ? 502 : 500, e instanceof Error ? e.message : String(e));
  }

  // A variant with its own A01 MPC-code plan is a standalone row; variants without
  // one are summed into their base package (e.g. "8SOIC(C2X)" + "8SOIC(CYX)" → "8SOIC")
  // and compared to the base's A01 plan.
  const mpcRows: PackageRow[] = [];
  const baseMerge = new Map<string, PackageRow>();

  const mkRow = (pkg: string, bonded: number): PackageRow => {
    const planShift = planPerShift(pkg, wip) ?? 0;
    const target = Math.trunc(planShift * hourFraction);
    const pct = target > 0 ? ((bonded - target) / target) * 100 : 0;
    return { package: pkg, plan_per_shift: planShift, bonded, target, pct };
  };

  for (const { package: pkg_key, bonded } of rows) {
    const code = mpcCode(pkg_key);
    const hasMpcPlan = code != null && wip.byMpc.has(code);

    if (hasMpcPlan) {
      mpcRows.push(mkRow(pkg_key, bonded));
    } else {
      const basePkg = pkg_key.split('(')[0] ?? pkg_key;
      const existing = baseMerge.get(basePkg);
      if (existing) {
        existing.bonded += bonded;
        existing.pct = existing.target > 0 ? ((existing.bonded - existing.target) / existing.target) * 100 : 0;
      } else {
        baseMerge.set(basePkg, mkRow(basePkg, bonded));
      }
    }
  }

  const result = [...mpcRows, ...baseMerge.values()];
  // Overlay A01 WIP/DOI + list position, matched by MPC code then name.
  for (const row of result) {
    row.wip = lookupWip(row.package, wip);
    row.doi = lookupDoi(row.package, wip);
    row.a01Seq = lookupOrder(row.package, wip);
  }
  // Default order = A01 sequence (packages not in A01 sort last).
  result.sort((a, b) => (a.a01Seq ?? Infinity) - (b.a01Seq ?? Infinity));
  return json(result);
};
