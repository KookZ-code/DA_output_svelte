// Response shapes — mirror WB_Dashboard/src/models.rs verbatim
// Keep field names snake_case to match what the original API returned and
// what the original frontend (app.js) consumed.

export type Shift = 'D' | 'N';

export interface SummaryResponse {
  date: string;
  shift: Shift;
  shift_label: string;
  window_start: string;
  window_end: string;
  total_bonded: number;
  target_shift: number;
  achievement_pct: number;
  active_machines: number;
  active_operators: number;
  daily_bonded: number; // D shift + N shift total for the same date
}

export interface HourlyResponse {
  hours: string[];
  target_cumulative: number[];
  packages: Record<string, number[]>;
}

export interface PackageRow {
  package: string;
  plan_per_shift: number;
  bonded: number;
  target: number;
  pct: number;
  wip?: number;    // DieAttach-stage WIP from the A01 pkgDOI API (matched by package)
  doi?: number;    // DieAttach-stage Days Of Inventory from A01 pkgDOI
  a01Seq?: number; // position in the A01 package list (default display order)
}

export interface DaEvent {
  job_type: string;
  t_start: string;
  t_end: string;   // empty string = still open/active
  des_job: string;
  dur_min: number;
  is_open?: boolean; // true = currently active job from job_list
}

/** Per-machine fields from the API center (/api/v1/da-uph/machines) */
export interface MachineRowDb {
  machine_id: string;
  badge_no: string;
  target_uph: number;
  uph: number;
  bonded_unit: number;
  vs_output_pct: number; // (bonded − target_uph × elapsed_hours) / expected × 100
  last_scan_ts: string | null; // "YYYY-MM-DD HH:MM:SS" of the latest in-slot scan
}

/** Full row after merging with DA Report utilization + events */
export interface MachineRow extends MachineRowDb {
  util_pct: number | null;
  events: DaEvent[];
}

export interface MachinesResponse {
  rows: MachineRow[];
  required_mc: number;   // ⌈plan_per_shift / (target_uph × shift_hours)⌉
  target_bonded: number; // Math.trunc(plan_per_shift × hourFraction) — pro-rated at this hour
}

export interface RawRecord {
  created_at: string;
  lot_id: string;
  package_mpc: string;
  uph: number;
  bonded_unit: number;
  delta_bonded: number;
  badge_no: string;
}

export interface RecordsResponse {
  current:   RawRecord[];
  prev_tail: RawRecord[]; // last 5 records from the previous shift (for boundary analysis)
}

export interface MonitorRow {
  machine_id: string;
  package: string;
  last_scan_ts: string | null;
  since_min: number | null;
  status: 'no_data' | 'stale' | 'active';
  events: DaEvent[]; // downtime/setup events during the shift (from DA Report overlay)
}

export interface MonitorResponse {
  rows: MonitorRow[];
  shift_label: string;
  as_of: string;       // "HH:MM" — time this snapshot was computed
  threshold_min: number;
}

// Internal plan row (server-side only)
export interface PlanRow {
  package_raw: string;
  package_norm: string;
  plan_per_day: number;
  plan_per_shift: number;
  uph_target: number;
}
