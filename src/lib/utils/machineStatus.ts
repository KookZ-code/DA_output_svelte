// Derive a machine's operational state + job-type pill styling from its DA events.
// Shared by the by-machine table and the machine-monitor page.

import type { DaEvent } from '$lib/types/dashboard';

export type StatusId = 'run' | 'down' | 'idle' | 'setup' | 'convert' | 'sbo' | 'pm';
export interface MachineStatus {
  id: StatusId;
  label: string;
  bg: string;
  tx: string;
}

export const STATUS_MAP: Record<StatusId, MachineStatus> = {
  run:     { id: 'run',     label: 'RUN',   bg: '#5EBF33', tx: '#fff' },
  down:    { id: 'down',    label: 'DOWN',  bg: '#CC0000', tx: '#fff' },
  idle:    { id: 'idle',    label: 'IDLE',  bg: '#78909C', tx: '#fff' },
  setup:   { id: 'setup',   label: 'SETUP', bg: '#1D9CE4', tx: '#fff' },
  convert: { id: 'convert', label: 'CONV',  bg: '#009688', tx: '#fff' },
  sbo:     { id: 'sbo',     label: 'SBO',   bg: '#17A2B8', tx: '#fff' },
  pm:      { id: 'pm',      label: 'PM',    bg: '#702076', tx: '#fff' },
};

/** A SETUP BY OPERATOR event counts as IDLE when its reason is purely waiting/idle
 *  (des_job mentions "Idle" or "Wait") rather than active setup work. */
export function isIdle(ev: { job_type: string; des_job: string }): boolean {
  return (ev.job_type || '').toUpperCase() === 'SETUP BY OPERATOR' && /idle|wait/i.test(ev.des_job || '');
}

/** Map a single event to its status bucket (handles the SBO → IDLE split). */
function eventStatus(ev: DaEvent): MachineStatus {
  if (isIdle(ev)) return STATUS_MAP.idle;
  const jt = (ev.job_type || '').toUpperCase();
  if (jt === 'M/C DOWN' || jt === 'ENGINEERING DOWN' || jt === 'FACILITY DOWN') return STATUS_MAP.down;
  if (jt === 'SETUP BY OPERATOR') return STATUS_MAP.sbo;
  if (jt === 'SETUP' || jt === 'CLEAN MOLD' || jt === 'CHANGE CAP') return STATUS_MAP.setup;
  if (jt === 'CONVERT') return STATUS_MAP.convert;
  if (jt === 'PM') return STATUS_MAP.pm;
  return STATUS_MAP.run;
}

// Compare "HH:MM" strings — returns true if a < b
function timeLt(a: string, b: string): boolean {
  return a.localeCompare(b) < 0;
}

/** Current operational status from the shift's events.
 *  Priority: explicitly-open job → time-active closed event → most-recent event. */
export function currentStatus(events: DaEvent[]): MachineStatus {
  if (!events.length) return STATUS_MAP.run;

  // Priority 1: explicitly open/active job (is_open flag from job_list)
  const openJob = events.find((e) => e.is_open);
  if (openJob) return eventStatus(openJob);

  // Priority 2: time-based check on closed events
  const now = new Date();
  const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let active: DaEvent | null = null;
  for (const ev of events) {
    if (!ev.t_start || !ev.t_end) continue;
    if (!timeLt(nowStr, ev.t_start) && timeLt(nowStr, ev.t_end)) {
      active = ev;
    }
  }
  if (!active) {
    // Take most recent event; if it ended before now → running
    const sorted = [...events].filter((e) => e.t_end).sort((a, b) => (b.t_start || '').localeCompare(a.t_start || ''));
    const last = sorted[0] ?? null;
    if (!last || (last.t_end && !timeLt(nowStr, last.t_end))) return STATUS_MAP.run;
    active = last;
  }
  if (!active) return STATUS_MAP.run;

  return eventStatus(active);
}

// ── Job type pill config ───────────────────────────────────────────────
const JOB_ABBR: Record<string, string> = {
  'M/C DOWN': 'DOWN', 'ENGINEERING DOWN': 'ENG↓', 'FACILITY DOWN': 'FAC↓',
  'PM': 'PM', 'SETUP': 'SETUP', 'SETUP BY OPERATOR': 'SBO',
  'CONVERT': 'CONV', 'CLEAN MOLD': 'CLEAN', 'CHANGE CAP': 'CHG',
};
const JOB_COLOR: Record<string, { bg: string; tx: string }> = {
  'M/C DOWN':          { bg: '#CC0000', tx: '#fff' },
  'ENGINEERING DOWN':  { bg: '#990000', tx: '#fff' },
  'FACILITY DOWN':     { bg: '#FD7F20', tx: '#fff' },
  'PM':                { bg: '#702076', tx: '#fff' },
  'SETUP':             { bg: '#1D9CE4', tx: '#fff' },
  'SETUP BY OPERATOR': { bg: '#17A2B8', tx: '#fff' },
  'CONVERT':           { bg: '#009688', tx: '#fff' },
  'CLEAN MOLD':        { bg: '#5EBF33', tx: '#fff' },
  'CHANGE CAP':        { bg: '#8A8A8A', tx: '#fff' },
};

export function pillStyle(ev: DaEvent): { bg: string; tx: string } {
  if (isIdle(ev)) return { bg: STATUS_MAP.idle.bg, tx: STATUS_MAP.idle.tx };
  return JOB_COLOR[(ev.job_type || '').toUpperCase()] ?? { bg: '#8A8A8A', tx: '#fff' };
}
export function pillAbbr(ev: DaEvent): string {
  if (isIdle(ev)) return 'IDLE';
  return JOB_ABBR[(ev.job_type || '').toUpperCase()] ?? (ev.job_type || '').slice(0, 5);
}
