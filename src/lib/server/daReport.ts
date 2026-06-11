// Server-only helper for the DA Report overlay (utilisation + events).
// Sourced from the API center's /api/v1/da/report (MSSQL) via mwGet — shared by
// the machines and monitor routes so the fetch/normalisation lives in one place.

import { mwGet } from '$lib/server/middleware';
import type { DaEvent } from '$lib/types/dashboard';

export interface DaReportMachine {
  machine_id: string;
  util_pct: number;
  events: DaEvent[];
}

/** Machine-ID normalisation: the DA Report uses "D/A # 334R", the output monitor uses
 *  "DA334R". Strip everything except letters/digits and uppercase → same key. */
export function normId(id: string): string {
  return id.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Fetch the DA shift report and index machines (util + events) by normalised id.
 *  Caller should `.catch()` to degrade gracefully when the report is unavailable. */
export async function fetchDaReport(date: string, shift: 'D' | 'N'): Promise<Map<string, DaReportMachine>> {
  const shiftFull = shift === 'D' ? 'Day' : 'Night';
  const data = await mwGet<{ machines?: DaReportMachine[] }>('/api/v1/da/report', {
    date,
    shift: shiftFull,
    packages: '__ALL__',
  });

  const map = new Map<string, DaReportMachine>();
  for (const m of data.machines ?? []) {
    map.set(normId(m.machine_id), m);
  }
  return map;
}
