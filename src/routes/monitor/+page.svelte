<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import type { MonitorRow, MonitorResponse, DaEvent } from '$lib/types/dashboard';
  import { currentStatus, pillStyle, pillAbbr } from '$lib/utils/machineStatus';

  const REFRESH_MS = 2 * 60 * 1000; // 2 min auto-refresh

  let data       = $state<MonitorResponse | null>(null);
  let loading    = $state(true);
  let lastFetch  = $state('');
  let pkgFilter    = $state('');
  let statusFilter = $state<MonitorRow['status'] | null>(null);

  function toggleStatus(s: MonitorRow['status']) {
    statusFilter = statusFilter === s ? null : s;
  }

  // Derive date/shift from URL params on mount
  let dateParam  = $state('');
  let shiftParam = $state('D');

  async function fetchData() {
    loading = true;
    const qs = `date=${dateParam}&shift=${shiftParam}`;
    try {
      const res = await fetch(`${base}/api/monitor?${qs}`);
      data = await res.json() as MonitorResponse;
      lastFetch = new Date().toLocaleTimeString();
    } catch (e) {
      console.error(e);
    } finally {
      loading = false;
    }
  }

  const filtered = $derived.by(() => {
    if (!data) return [];
    return data.rows.filter(r => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (pkgFilter && !r.package.toLowerCase().includes(pkgFilter.toLowerCase())) return false;
      return true;
    });
  });

  const counts = $derived({
    no_data: data?.rows.filter(r => r.status === 'no_data').length ?? 0,
    stale:   data?.rows.filter(r => r.status === 'stale').length   ?? 0,
    active:  data?.rows.filter(r => r.status === 'active').length  ?? 0,
  });

  const packages = $derived([...new Set((data?.rows ?? []).map(r => r.package).filter(Boolean))].sort());

  function fmtSince(min: number | null): string {
    if (min === null) return '—';
    if (min < 60)  return `${min}m ago`;
    const h = Math.floor(min / 60), m = min % 60;
    return `${h}h ${m}m ago`;
  }

  function statusLabel(s: MonitorRow['status']): string {
    return s === 'no_data' ? 'NO DATA' : s === 'stale' ? 'STALE' : 'ACTIVE';
  }

  // ── CSV export ─────────────────────────────────────────────────────────
  function csvCell(v: string): string {
    return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }

  function eventsToText(events: DaEvent[]): string {
    return events
      .map((e) => {
        const range = `${e.t_start}-${e.t_end || 'now'}`;
        const desc = e.des_job ? ` · ${e.des_job}` : '';
        return `${pillAbbr(e)} ${range} (${e.dur_min}m)${desc}`;
      })
      .join(' | ');
  }

  /** Export the currently-filtered rows to a CSV file (UTF-8 BOM for Excel). */
  function exportCsv() {
    if (!data || filtered.length === 0) return;
    const headers = ['Machine', 'Package', 'Last Update', 'Since (min)', 'Status', 'Activity', 'Events'];
    const lines = [headers.join(',')];
    for (const r of filtered) {
      const cells = [
        r.machine_id,
        r.package || '',
        r.last_scan_ts ?? '',
        r.since_min ?? '',
        statusLabel(r.status),
        currentStatus(r.events).label,
        eventsToText(r.events),
      ].map((c) => csvCell(String(c)));
      lines.push(cells.join(','));
    }
    const csv = '﻿' + lines.join('\r\n');
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `machine-monitor_${dateParam}_${shiftParam}.csv`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      // Defer cleanup — revoking immediately can abort the download in some browsers.
      setTimeout(() => {
        a.remove();
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (err) {
      console.error('CSV export failed', err);
      alert('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    dateParam  = params.get('date')  ?? new Date().toISOString().slice(0, 10);
    shiftParam = params.get('shift') ?? 'D';
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  });
</script>

<svelte:head><title>Machine Monitor — DA</title></svelte:head>

<div class="page">
  <!-- ── Header ──────────────────────────────────────────────────────── -->
  <header class="top-bar">
    <div class="top-left">
      <a href="{base}/" class="back-btn">← Dashboard</a>
      <div class="title-block">
        <span class="title">Machine Monitor</span>
        {#if data}<span class="shift-label">{data.shift_label}</span>{/if}
      </div>
    </div>
    <div class="top-right">
      {#if loading}
        <span class="refreshing">Refreshing…</span>
      {:else}
        <span class="updated">Updated {lastFetch} · Auto-refresh 2 min</span>
      {/if}
    </div>
  </header>

  <!-- ── KPI strip ───────────────────────────────────────────────────── -->
  <div class="kpi-strip">
    <button class="kpi-chip no-data" class:selected={statusFilter === 'no_data'} onclick={() => toggleStatus('no_data')}>
      <span class="kpi-num">{counts.no_data}</span>
      <span class="kpi-lbl">No Data</span>
    </button>
    <button class="kpi-chip stale" class:selected={statusFilter === 'stale'} onclick={() => toggleStatus('stale')}>
      <span class="kpi-num">{counts.stale}</span>
      <span class="kpi-lbl">Stale &gt;{data?.threshold_min ?? 120}m</span>
    </button>
    <button class="kpi-chip active" class:selected={statusFilter === 'active'} onclick={() => toggleStatus('active')}>
      <span class="kpi-num">{counts.active}</span>
      <span class="kpi-lbl">Active</span>
    </button>
    <button class="kpi-chip total" class:selected={statusFilter === null} onclick={() => statusFilter = null}>
      <span class="kpi-num">{counts.no_data + counts.stale + counts.active}</span>
      <span class="kpi-lbl">All</span>
    </button>
  </div>

  <!-- ── Filter bar ──────────────────────────────────────────────────── -->
  <div class="filter-bar">
    <input
      type="text"
      class="pkg-search"
      placeholder="Filter by package…"
      bind:value={pkgFilter}
    />
    <span class="filter-count">{filtered.length} machines</span>
    <button
      class="export-btn"
      onclick={exportCsv}
      disabled={!data || filtered.length === 0}
      title="Export the {filtered.length} filtered rows to CSV"
    >⬇ Export CSV</button>
  </div>

  <!-- ── Table ───────────────────────────────────────────────────────── -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Machine</th>
          <th>Package</th>
          <th class="r">Last Update</th>
          <th class="r">Since</th>
          <th>Status</th>
          <th>Activity</th>
          <th>Events (shift)</th>
        </tr>
      </thead>
      <tbody>
        {#if !data}
          <tr><td colspan="7" class="empty">Loading…</td></tr>
        {:else if filtered.length === 0}
          <tr><td colspan="7" class="empty">No machines found</td></tr>
        {:else}
          {#each filtered as r (r.machine_id)}
            {@const st = currentStatus(r.events)}
            <tr class="row-{r.status}">
              <td><strong>{r.machine_id}</strong></td>
              <td class="pkg">{r.package || '—'}</td>
              <td class="r mono">{r.last_scan_ts ? r.last_scan_ts.slice(11, 16) : '—'}</td>
              <td class="r since-{r.status}">{fmtSince(r.since_min)}</td>
              <td>
                <span class="badge badge-{r.status}">{statusLabel(r.status)}</span>
              </td>
              <td>
                <span class="state-pill" style:background={st.bg} style:color={st.tx}>{st.label}</span>
              </td>
              <td class="td-events">
                <div class="ev-wrap">
                  {#each r.events as ev, i (i)}
                    {@const c = pillStyle(ev)}
                    {@const ab = pillAbbr(ev)}
                    {@const desc = ev.des_job ? ' · ' + (ev.des_job.length > 18 ? ev.des_job.slice(0, 18) + '…' : ev.des_job) : ''}
                    <span class="ev-pill"
                      style:background={c.bg}
                      style:color={c.tx}
                      title="{ev.job_type}{ev.des_job ? ' · ' + ev.des_job : ''} · {ev.t_start}–{ev.t_end || 'now'} ({ev.dur_min}m)">
                      <span class="pill-abbr">{ab}</span>
                      <span class="pill-time">{ev.t_start}–{ev.t_end || 'now'}</span>{desc}
                      <span class="pill-dur">({ev.dur_min}m)</span>
                    </span>
                  {:else}
                    <span class="ev-none">—</span>
                  {/each}
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: var(--color-surface-gray);
    font-family: var(--font);
  }

  /* ── Top bar ─────────────────────────────────────────────────────── */
  .top-bar {
    background: var(--color-primary);
    color: #fff;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .top-left { display: flex; align-items: center; gap: 20px; }
  .back-btn {
    color: rgba(255,255,255,0.8);
    text-decoration: none;
    font-size: 13px;
    font-weight: 600;
    padding: 4px 10px;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: var(--radius-sm);
  }
  .back-btn:hover { background: rgba(255,255,255,0.1); }
  .title-block { display: flex; flex-direction: column; gap: 2px; }
  .title { font-size: 16px; font-weight: 700; }
  .shift-label { font-size: 11px; opacity: 0.75; }
  .updated, .refreshing { font-size: 12px; opacity: 0.75; }

  /* ── KPI strip ───────────────────────────────────────────────────── */
  .kpi-strip {
    display: flex;
    gap: 12px;
    padding: 16px 24px 0;
    flex-wrap: wrap;
  }
  .kpi-chip {
    display: flex;
    align-items: baseline;
    gap: 8px;
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    padding: 12px 20px;
    border-left: 4px solid transparent;
    border-top: none; border-right: none; border-bottom: none;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    cursor: pointer;
    font-family: var(--font);
    transition: box-shadow 0.15s, opacity 0.15s;
  }
  .kpi-chip:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
  .kpi-chip.selected { box-shadow: 0 0 0 2px currentColor, 0 2px 8px rgba(0,0,0,0.1); }
  .kpi-chip:not(.selected) { opacity: 0.65; }
  .kpi-chip.no-data { border-color: #CC0000; }
  .kpi-chip.stale   { border-color: #F68D2E; }
  .kpi-chip.active  { border-color: #6CC24A; }
  .kpi-chip.total   { border-color: var(--color-primary-hover); }
  .kpi-num { font-size: 28px; font-weight: 700; font-feature-settings: 'tnum'; }
  .kpi-chip.no-data .kpi-num { color: #CC0000; }
  .kpi-chip.stale   .kpi-num { color: #F68D2E; }
  .kpi-chip.active  .kpi-num { color: #6CC24A; }
  .kpi-chip.total   .kpi-num { color: var(--color-primary-hover); }
  .kpi-lbl { font-size: 11px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }

  /* ── Filter bar ──────────────────────────────────────────────────── */
  .filter-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 24px;
  }
  .pkg-search {
    padding: 7px 12px;
    border: 1px solid var(--color-border-input);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-family: var(--font);
    width: 260px;
    background: var(--color-surface);
  }
  .pkg-search:focus { outline: none; border-color: var(--color-accent-blue); }
  .filter-count { font-size: 12px; color: var(--color-text-muted); }
  .export-btn {
    margin-left: auto;
    padding: 7px 14px;
    border: 1px solid var(--color-border-input);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-primary);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .export-btn:hover:not(:disabled) { background: var(--color-surface-alt); border-color: var(--color-accent-blue); }
  .export-btn:disabled { opacity: 0.5; cursor: default; }

  /* ── Table ───────────────────────────────────────────────────────── */
  .table-wrap {
    margin: 0 24px 24px;
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    overflow: hidden;
  }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th {
    background: var(--color-surface-gray);
    color: var(--color-text-muted);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
    padding: 9px 14px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
  }
  td { padding: 9px 14px; border-bottom: 1px solid var(--color-surface-gray); }
  .r   { text-align: right; }
  .mono { font-feature-settings: 'tnum'; }
  .pkg { color: var(--color-text-muted); font-size: 12px; }
  .empty { text-align: center; color: var(--color-text-disabled); padding: 32px; }

  /* Row tinting */
  .row-no_data { background: #fff5f5; }
  .row-stale   { background: #fff8f0; }
  .row-no_data:hover { background: #ffe8e8; }
  .row-stale:hover   { background: #ffeedd; }
  tr:hover { background: var(--color-surface-alt); }

  /* Since column color */
  .since-no_data { color: #CC0000; font-weight: 700; }
  .since-stale   { color: #F68D2E; font-weight: 700; }
  .since-active  { color: var(--color-text-muted); }

  /* Status badge */
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .badge-no_data { background: #fdecea; color: #CC0000; }
  .badge-stale   { background: #fef4e8; color: #F68D2E; }
  .badge-active  { background: #e8f5ee; color: #5EBF33; }

  /* Operational state pill (from DA Report events) */
  .state-pill {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  /* Event pills (downtime/setup during the shift) — matches the by-machine table */
  .td-events { max-width: 460px; }
  .ev-wrap { display: flex; flex-wrap: wrap; gap: 3px; }
  .ev-pill {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 600; white-space: nowrap;
    cursor: default; line-height: 1.4;
  }
  .pill-abbr { font-weight: 700; }
  .pill-time { opacity: .85; font-size: 9px; font-weight: 500; }
  .pill-dur  { opacity: .7;  font-size: 9px; font-weight: 500; }
  .ev-none { color: var(--color-text-disabled); }
</style>
