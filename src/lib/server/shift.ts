// Port of WB_Dashboard/src/shift.rs
//
// D shift "YYYY-MM-DD" = 07:00–18:59 same calendar date
// N shift "YYYY-MM-DD" = 19:00 (previous day) → 06:59 (this day)

import type { Shift } from '$lib/types/dashboard';

export interface ShiftWindow {
  start: string; // "YYYY-MM-DD HH:MM:SS"
  end: string;
  hours: number[];
  label: string;
  date: string; // the input date (YYYY-MM-DD)
  shift: Shift;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function formatDateLabel(date: string): string {
  // "2026-05-29" → "29 May '26"
  const [y, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

function prevDay(date: string): string {
  // "2026-05-29" → "2026-05-28"
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function shiftWindow(date: string, shift: Shift): ShiftWindow {
  if (shift === 'D') {
    return {
      start: `${date} 07:00:00`,
      end: `${date} 18:59:59`,
      hours: [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18],
      label: `${formatDateLabel(date)} — D Shift`,
      date,
      shift,
    };
  }
  // N
  const prev = prevDay(date);
  return {
    start: `${prev} 19:00:00`,
    end: `${date} 06:59:59`,
    hours: [19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6],
    label: `${formatDateLabel(date)} — N Shift`,
    date,
    shift,
  };
}

export function hourLabel(h: number): string {
  return pad2(h) + ':00';
}

/** Parse "YYYY-MM-DD HH:MM:SS" to epoch ms (UTC for arithmetic only — only
 *  relative differences are used, so UTC vs local doesn't change `t2 - t1`). */
export function parseSqlTs(ts: string): number {
  const y = +ts.slice(0, 4);
  const m = +ts.slice(5, 7);
  const d = +ts.slice(8, 10);
  const hh = +ts.slice(11, 13);
  const mm = +ts.slice(14, 16);
  const ss = +ts.slice(17, 19);
  return Date.UTC(y, m - 1, d, hh, mm, ss);
}

/** End-of-hour timestamp for a given slot (clamped to shift end). */
export function slotEndForHour(w: ShiftWindow, slotIdx: number, hour: number): string {
  // For D shift, all hours belong to the same date as start.
  // For N shift, hours 19..23 belong to start.date; hours 0..6 belong to end.date.
  void slotIdx;
  const date = hour <= 6 ? w.end.slice(0, 10) : w.start.slice(0, 10);
  const slot = `${date} ${pad2(hour)}:59:59`;
  // Clamp to shift end
  return slot < w.end ? slot : w.end;
}
