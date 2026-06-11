// Reactive dashboard state — Svelte 5 runes.
import type { Shift } from '$lib/types/dashboard';

export interface DashboardState {
  date: string;
  shift: Shift;
  selectedHour: number | null;
  selectedPkg: string | null;
  selectedMachine: string | null;
  pkgFilter: string[];
}

function pad2(n: number) {
  return n < 10 ? '0' + n : '' + n;
}
function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Mirror of WB_Dashboard's initShiftFromNow — returns the active shift for "right now". */
export function initialShift(): { date: string; shift: Shift } {
  const now = new Date();
  const h = now.getHours();
  if (h >= 7 && h < 19) return { date: fmtDate(now), shift: 'D' };
  if (h >= 19) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return { date: fmtDate(t), shift: 'N' };
  }
  return { date: fmtDate(now), shift: 'N' };
}

const init = initialShift();

export const dashboard = $state<DashboardState>({
  date: init.date,
  shift: init.shift,
  selectedHour: null,
  selectedPkg: null,
  selectedMachine: null,
  pkgFilter: [],
});

export function resetDrilldown(): void {
  dashboard.selectedHour = null;
  dashboard.selectedPkg = null;
  dashboard.selectedMachine = null;
}

/** Returns the last hour-slot index that has started, or -1 if shift is in the future. */
export function getCutoffIndex(hours: string[]): number {
  if (hours.length === 0) return -1;
  const now = new Date();
  const h = now.getHours();
  const todayStr = fmtDate(now);

  let currShift: Shift;
  let currDate: string;
  if (h >= 7 && h < 19) {
    currShift = 'D';
    currDate = todayStr;
  } else if (h >= 19) {
    currShift = 'N';
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    currDate = fmtDate(t);
  } else {
    currShift = 'N';
    currDate = todayStr;
  }

  // Not the active shift → show all
  if (dashboard.date !== currDate || dashboard.shift !== currShift) {
    return hours.length - 1;
  }

  let cutoff = -1;
  hours.forEach((label, i) => {
    const slotH = parseInt(label.split(':')[0], 10);
    if (currShift === 'D') {
      if (slotH <= h) cutoff = i;
    } else if (slotH >= 19) {
      if ((h >= 19 && slotH <= h) || h < 7) cutoff = i;
    } else {
      if (h < 7 && slotH <= h) cutoff = i;
    }
  });
  return cutoff;
}
