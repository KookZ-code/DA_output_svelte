<script lang="ts">
  // Drill 3 — raw scan records as a bottom drawer (50 vh).
  // Shows last 5 records from previous shift (for boundary context) followed
  // by current shift records, with EMH events interleaved by timestamp.
  import type { RawRecord, DaEvent } from '$lib/types/dashboard';
  import { fmtInt } from '$lib/utils/format';
  import { isIdle, STATUS_MAP } from '$lib/utils/machineStatus';

  type Props = {
    rows: RawRecord[] | null;
    prevTail: RawRecord[];
    events: DaEvent[];
    machineId: string | null;
    shiftStart: string; // "YYYY-MM-DD HH:MM:SS"
    open: boolean;
    onClose: () => void;
  };
  const { rows, prevTail, events, machineId, shiftStart, open, onClose }: Props = $props();

  // ── Timeline item types ───────────────────────────────────────────────────
  type RecordItem = { kind: 'record'; data: RawRecord; isPrev: boolean };
  type EventItem  = { kind: 'event';  data: DaEvent };
  type SepItem    = { kind: 'sep' };
  type TimelineItem = RecordItem | EventItem | SepItem;

  // Convert DaEvent t_start "HH:MM" → full timestamp using shiftStart date
  function eventTs(t: string): string {
    if (!shiftStart || !t) return '';
    const date      = shiftStart.slice(0, 10);
    const shiftHour = Number(shiftStart.slice(11, 13));
    const evHour    = Number(t.slice(0, 2));
    let d = date;
    // Night shift: events with HH < 07 belong to the next calendar day.
    // Use local date arithmetic (getFullYear/Month/Date) — NOT toISOString()
    // which returns a UTC date and will be one day behind in UTC+7 timezone.
    if (shiftHour >= 19 && evHour < 7) {
      const dt = new Date(date + 'T00:00:00');
      dt.setDate(dt.getDate() + 1);
      const y  = dt.getFullYear();
      const m  = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      d = `${y}-${m}-${dd}`;
    }
    return `${d} ${t}:00`;
  }

  const timeline = $derived.by((): TimelineItem[] => {
    if (!rows) return [];

    const sortedEvents = [...events]
      .filter(e => e.t_start)
      .sort((a, b) => eventTs(a.t_start).localeCompare(eventTs(b.t_start)));

    const items: TimelineItem[] = [];

    for (const r of prevTail) {
      items.push({ kind: 'record', data: r, isPrev: true });
    }
    if (prevTail.length > 0 && rows.length > 0) {
      items.push({ kind: 'sep' });
    }

    // Merge current records + events by time
    let ei = 0;
    for (const r of rows) {
      while (ei < sortedEvents.length && eventTs(sortedEvents[ei].t_start) <= r.created_at) {
        items.push({ kind: 'event', data: sortedEvents[ei++] });
      }
      items.push({ kind: 'record', data: r, isPrev: false });
    }
    while (ei < sortedEvents.length) {
      items.push({ kind: 'event', data: sortedEvents[ei++] });
    }

    return items;
  });

  // ── Formatting ────────────────────────────────────────────────────────────
  function deltaCls(d: number): string {
    if (d > 0) return 'pos';
    if (d < 0) return 'neg';
    return 'zero';
  }
  function deltaStr(d: number): string {
    if (d > 0) return '+' + fmtInt(d);
    if (d === 0) return '—';
    return fmtInt(d);
  }

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
  function evColor(jt: string) {
    return JOB_COLOR[jt.toUpperCase()] ?? { bg: '#8A8A8A', tx: '#fff' };
  }
  function evLabel(ev: DaEvent): string {
    const t    = ev.t_end ? `${ev.t_start}–${ev.t_end}` : `${ev.t_start}–`;
    const desc = ev.des_job ? ` · ${ev.des_job}` : '';
    const dur  = ev.dur_min ? ` (${ev.dur_min}m)` : '';
    return `${t}${desc}${dur}`;
  }
</script>

<!-- Overlay -->
{#if open}
  <button class="overlay" onclick={onClose} aria-label="Close records"></button>
{/if}

<!-- Drawer -->
<div class="drawer" class:open>
  <div class="drawer-header">
    <span class="drawer-title">
      {#if machineId}▼ {machineId} — Raw Scan Records ({rows?.length ?? 0}){:else}Raw Scan Records{/if}
    </span>
    <button class="close-btn" onclick={onClose} aria-label="Close">✕</button>
  </div>

  <div class="drawer-body">
    {#if rows == null}
      <div class="empty-state">คลิกเครื่องในตารางเพื่อดู scan records</div>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Lot ID</th>
            <th>Package</th>
            <th class="r">UPH</th>
            <th class="r">Attached (cum.)</th>
            <th class="r">Delta</th>
            <th>Operator</th>
          </tr>
        </thead>
        <tbody>
          {#each timeline as item, i (i)}
            {#if item.kind === 'sep'}
              <tr class="sep-row">
                <td colspan="7">
                  <span class="sep-label">── {shiftStart.slice(11,16)} — Shift Start ──</span>
                </td>
              </tr>
            {:else if item.kind === 'event'}
              {@const idle = isIdle(item.data)}
              {@const c = idle ? { bg: STATUS_MAP.idle.bg, tx: STATUS_MAP.idle.tx } : evColor(item.data.job_type)}
              <tr class="event-row">
                <td colspan="7">
                  <span class="ev-pill"
                    style:background={c.bg}
                    style:color={c.tx}
                    class:ev-open={item.data.is_open}
                  >{idle ? 'IDLE' : item.data.job_type}</span>
                  <span class="ev-label">{evLabel(item.data)}</span>
                </td>
              </tr>
            {:else}
              <tr class:prev-row={item.isPrev}>
                <td class:muted={item.isPrev}>{item.data.created_at.slice(11, 16)}</td>
                <td class:muted={item.isPrev}>{item.data.lot_id}</td>
                <td class:muted={item.isPrev}>{item.data.package_mpc}</td>
                <td class="r" class:muted={item.isPrev}>{fmtInt(item.data.uph)}</td>
                <td class="r" class:muted={item.isPrev}>{fmtInt(item.data.bonded_unit)}</td>
                <td class="r">
                  <span class={item.isPrev ? 'zero' : deltaCls(item.data.delta_bonded)}>
                    {item.isPrev ? '—' : deltaStr(item.data.delta_bonded)}
                  </span>
                </td>
                <td class:muted={item.isPrev}>{item.data.badge_no}</td>
              </tr>
            {/if}
          {/each}
          {#if rows.length === 0 && prevTail.length === 0}
            <tr><td colspan="7" class="empty">No records in this shift window</td></tr>
          {/if}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    z-index: 200;
    animation: fade-in 0.15s ease;
    border: none;
    cursor: default;
  }
  .drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 92vh;
    background: var(--color-surface);
    border-top: 2px solid var(--color-accent-blue);
    box-shadow: 0 -4px 24px rgba(0,0,0,0.15);
    z-index: 201;
    display: flex;
    flex-direction: column;
    transform: translateY(100%);
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .drawer.open { transform: translateY(0); }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }
  .drawer-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-accent-blue);
  }
  .close-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 16px;
    color: var(--color-text-muted);
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    line-height: 1;
  }
  .close-btn:hover { background: var(--color-surface-gray); color: var(--color-text-body); }

  .drawer-body {
    overflow-y: visible;
    padding: 0;
  }
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-disabled);
    font-size: 13px;
  }

  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    background: var(--color-surface-gray);
    color: var(--color-text-muted);
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.04em;
    font-weight: 700;
    padding: 6px 10px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 1;
  }
  td {
    padding: 6px 10px;
    border-bottom: 1px solid var(--color-surface-gray);
    white-space: nowrap;
  }
  .r { text-align: right; font-feature-settings: 'tnum'; }
  .muted { color: var(--color-text-muted); }

  .prev-row { background: var(--color-surface-alt); opacity: 0.75; }

  .sep-row td { padding: 4px 10px; background: #e8f4fb; border: none; }
  .sep-label {
    font-size: 10px;
    font-weight: 700;
    color: var(--color-accent-blue);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .event-row td { padding: 3px 10px; background: transparent; border: none; }
  .ev-pill {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    margin-right: 6px;
    vertical-align: middle;
  }
  .ev-label { font-size: 11px; color: var(--color-text-muted); vertical-align: middle; }

  .pos  { color: var(--color-accent-green); font-weight: 700; }
  .neg  { color: var(--color-brand-red);    font-weight: 700; }
  .zero { color: var(--color-text-disabled); }
  .empty { text-align: center; color: var(--color-text-disabled); padding: 24px; }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
</style>
