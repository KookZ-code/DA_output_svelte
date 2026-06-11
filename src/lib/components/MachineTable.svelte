<script lang="ts">
  // Drill 2 — machine table for selected (hour, package).
  import type { MachineRow } from '$lib/types/dashboard';
  import { dashboard } from '$lib/stores/dashboard.svelte';
  import { fmtInt, fmtSignedPct } from '$lib/utils/format';
  import { STATUS_MAP, currentStatus, pillStyle, pillAbbr, type StatusId } from '$lib/utils/machineStatus';

  type Props = {
    rows: MachineRow[] | null;
    pkg: string | null;
    requiredMc: number;
    targetBonded: number;
    onSelect: (machineId: string) => void;
  };
  const { rows, pkg, requiredMc, targetBonded, onSelect }: Props = $props();

  // Expected output per machine = pro-rated target ÷ number of reporting machines
  const expectedPerMachine = $derived(
    targetBonded > 0 && (rows?.length ?? 0) > 0
      ? Math.trunc(targetBonded / (rows?.length ?? 1))
      : 0
  );

  // ── Sortable columns ──────────────────────────────────────────────────────
  type SortCol = 'machine_id' | 'bonded_unit' | 'vs_output_pct' | 'last_scan_ts' | 'util_pct';

  let sortCol = $state<SortCol>('bonded_unit');
  let sortAsc = $state(false);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'machine_id' || col === 'last_scan_ts'; }
  }

  function si(col: SortCol): string {
    return sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : '';
  }

  const sorted = $derived.by(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      let diff: number;
      if (sortCol === 'machine_id') {
        diff = a.machine_id.localeCompare(b.machine_id);
      } else if (sortCol === 'last_scan_ts') {
        diff = (a.last_scan_ts ?? '').localeCompare(b.last_scan_ts ?? '');
      } else if (sortCol === 'util_pct') {
        diff = (a.util_pct ?? -1) - (b.util_pct ?? -1);
      } else {
        diff = (a[sortCol] as number) - (b[sortCol] as number);
      }
      return sortAsc ? diff : -diff;
    });
  });

  const reportingMc = $derived(rows?.length ?? 0);
  const mcDelta     = $derived(reportingMc - requiredMc);
  const mcTone      = $derived(
    requiredMc === 0 ? 'neutral' : mcDelta >= 0 ? 'green' : 'red'
  );

  const hasUtil = $derived(rows?.some(r => r.util_pct !== null) ?? false);

  // Status KPI counts
  const statusCounts = $derived.by(() => {
    if (!rows || !hasUtil) return null;
    const counts: Record<StatusId, number> = { run:0, down:0, idle:0, setup:0, convert:0, sbo:0, pm:0 };
    for (const r of rows) counts[currentStatus(r.events).id]++;
    return counts;
  });

  const STATUS_KPI_ORDER: StatusId[] = ['run','down','idle','setup','convert','sbo','pm'];

  function uphColor(r: MachineRow): string {
    if (r.target_uph <= 0) return 'var(--color-text-body)';
    if (r.uph >= r.target_uph)        return 'var(--color-accent-green)';
    if (r.uph >= r.target_uph * 0.85) return 'var(--color-accent-orange)';
    return 'var(--color-brand-red)';
  }

  function badgeClass(pct: number): string {
    if (pct >= 0)   return 'green';
    if (pct >= -20) return 'orange';
    return 'red';
  }

  function utilColor(pct: number): string {
    if (pct >= 90) return '#5EBF33';
    if (pct >= 85) return '#FD7F20';
    return '#CC0000';
  }

  // Machine status + job-type pills now live in $lib/utils/machineStatus (shared
  // with the machine-monitor page).
</script>

{#if rows == null || pkg == null}
  <div class="placeholder">
    <div class="icon">←</div>
    <span>Click a package to see machine breakdown</span>
  </div>
{:else}
  <div class="active">
    <div class="label">▼ {pkg} — by Machine</div>

    <!-- Header row: status KPIs + M/C counts in one line -->
    <div class="header-row">
      <!-- Status KPI chips -->
      {#if statusCounts}
        <div class="status-chips">
          {#each STATUS_KPI_ORDER as sid (sid)}
            {@const st = STATUS_MAP[sid]}
            {@const cnt = statusCounts[sid]}
            {#if cnt > 0 || sid === 'run'}
              <div class="sk-chip" style="--sb:{st.bg}" title="{st.label}">
                <span class="sk-num">{cnt}</span>
                <span class="sk-label" style:color={st.bg}>{st.label}</span>
              </div>
            {/if}
          {/each}
        </div>
      {/if}

      <!-- Divider -->
      {#if statusCounts}<div class="hdr-sep"></div>{/if}

      <!-- Reporting / required -->
      <div class="mc-stat">
        <span class="mc-val">{reportingMc}</span>
        <span class="mc-sub">reporting</span>
      </div>
      <span class="mc-slash">/</span>
      <div class="mc-stat">
        <span class="mc-val">{requiredMc > 0 ? requiredMc : '—'}</span>
        <span class="mc-sub">required</span>
      </div>
      {#if requiredMc > 0}
        <div class="mc-delta {mcTone}">
          {mcDelta >= 0 ? '+' : ''}{mcDelta} M/C
        </div>
      {/if}
    </div>

    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th><button class="th-sort" onclick={() => toggleSort('machine_id')}>Machine{si('machine_id')}</button></th>
            <th class="r">Expected</th>
            <th class="r"><button class="th-sort" onclick={() => toggleSort('bonded_unit')}>Output Units{si('bonded_unit')}</button></th>
            <th class="r"><button class="th-sort" onclick={() => toggleSort('vs_output_pct')}>Output vs Expected{si('vs_output_pct')}</button></th>
            <th class="r"><button class="th-sort" onclick={() => toggleSort('last_scan_ts')}>Last Update{si('last_scan_ts')}</button></th>
            {#if hasUtil}
              <th>Status</th>
              <th class="r"><button class="th-sort" onclick={() => toggleSort('util_pct')}>Utilization{si('util_pct')}</button></th>
              <th>Events in Shift</th>
            {/if}
          </tr>
        </thead>
        <tbody>
          {#each sorted as r (r.machine_id)}
            <tr
              class:selected={r.machine_id === dashboard.selectedMachine}
              class:row-low={r.util_pct !== null && r.util_pct < 85}
              onclick={() => onSelect(r.machine_id)}
            >
              <td><strong>{r.machine_id}</strong></td>
              <td class="r muted">{expectedPerMachine > 0 ? fmtInt(expectedPerMachine) : '—'}</td>
              <td class="r">{fmtInt(r.bonded_unit)}</td>
              <td class="r">
                <span class="badge {badgeClass(r.vs_output_pct)}">
                  {fmtSignedPct(r.vs_output_pct, 0)}
                </span>
              </td>
              <td class="r muted">{r.last_scan_ts ? r.last_scan_ts.slice(11, 16) : '—'}</td>

              {#if hasUtil}
                <!-- Status indicator -->
                {#if true}
                  {@const st = currentStatus(r.events)}
                  <td class="td-status">
                    <span class="status-badge"
                      style:background={st.bg}
                      style:color={st.tx}>{st.label}</span>
                  </td>
                {/if}

                <!-- Utilization — value only, no bar -->
                <td class="r td-util">
                  {#if r.util_pct !== null}
                    {@const uc = utilColor(r.util_pct)}
                    <span style:color={uc} style:font-weight="700"
                          style:font-size="12px">{r.util_pct.toFixed(1)}%</span>
                  {:else}
                    <span class="muted">—</span>
                  {/if}
                </td>

                <!-- Events in Shift -->
                <td class="td-events">
                  <div class="ev-wrap">
                    {#each r.events as ev, i (i)}
                      {@const c  = pillStyle(ev)}
                      {@const ab = pillAbbr(ev)}
                      {@const desc = ev.des_job ? ' · ' + (ev.des_job.length > 18 ? ev.des_job.slice(0,18)+'…' : ev.des_job) : ''}
                      <span class="ev-pill"
                        style:background={c.bg}
                        style:color={c.tx}
                        title="{ev.job_type}{ev.des_job ? ' · '+ev.des_job : ''} · {ev.t_start}–{ev.t_end} ({ev.dur_min}m)">
                        <span class="pill-abbr">{ab}</span>
                        <span class="pill-time">{ev.t_start}–{ev.t_end}</span>{desc}
                        <span class="pill-dur">({ev.dur_min}m)</span>
                      </span>
                    {:else}
                      <span class="muted">—</span>
                    {/each}
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
          {#if rows.length === 0}
            <tr>
              <td colspan={hasUtil ? 9 : 6} class="empty">
                No machines reporting this package in this slot
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>
  </div>
{/if}

<style>
  .placeholder,
  .active {
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    min-height: 220px;
    padding: 16px 20px;
  }
  .placeholder {
    border: 2px dashed var(--color-border);
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    color: var(--color-text-disabled);
    font-size: 13px; gap: 8px;
  }
  .icon { font-size: 30px; }
  .active { border: 1px solid var(--color-primary); }
  .label {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--color-primary); margin-bottom: 8px;
  }

  /* ── Header row (status chips + M/C counts on one line) ─────────── */
  .header-row {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin-bottom: 10px;
    padding: 6px 12px;
    background: var(--color-surface-gray);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  /* Status chips */
  .status-chips { display: flex; gap: 4px; align-items: center; }
  .sk-chip {
    display: flex; align-items: baseline; gap: 5px;
    padding: 3px 10px;
    background: var(--color-surface);
    border-left: 3px solid var(--sb);
    border-radius: var(--radius-sm);
    box-shadow: 0 1px 2px rgba(0,0,0,.06);
  }
  .sk-num {
    font-size: 15px; font-weight: 800;
    font-feature-settings: 'tnum'; line-height: 1;
    color: var(--color-text-body);
  }
  .sk-label {
    font-size: 9px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .6px;
  }

  /* Separator */
  .hdr-sep {
    width: 1px; height: 20px;
    background: var(--color-border);
    margin: 0 4px; flex-shrink: 0;
  }

  /* M/C reporting / required */
  .mc-stat  { display: flex; align-items: baseline; gap: 3px; }
  .mc-val   { font-size: 14px; font-weight: 700; font-feature-settings: 'tnum'; color: var(--color-text-body); }
  .mc-sub   { font-size: 9px; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .04em; }
  .mc-slash { font-size: 12px; color: var(--color-text-muted); margin: 0 1px; }
  .mc-delta {
    padding: 2px 8px; border-radius: var(--radius-sm);
    font-size: 11px; font-weight: 700; margin-left: 2px;
  }
  .mc-delta.green   { background: #e8f5ee; color: var(--color-accent-green); }
  .mc-delta.red     { background: #fdecea; color: var(--color-brand-red); }
  .mc-delta.neutral { background: var(--color-surface); color: var(--color-text-muted); }

  /* Table */
  .table-scroll { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    background: var(--color-surface-gray); color: var(--color-text-muted);
    text-transform: uppercase; font-size: 10px; letter-spacing: 0.04em;
    font-weight: 700; padding: 8px 10px; text-align: left;
    border-bottom: 1px solid var(--color-border); white-space: nowrap;
  }
  .th-sort {
    background: none; border: none; padding: 0; font: inherit;
    color: inherit; letter-spacing: inherit; text-transform: inherit;
    cursor: pointer; user-select: none; white-space: nowrap;
  }
  .th-sort:hover { color: var(--color-primary); }
  td { padding: 7px 10px; border-bottom: 1px solid var(--color-surface-gray); vertical-align: middle; }
  tbody tr { cursor: pointer; }
  tbody tr:hover  { background: var(--color-surface-alt); }
  tbody tr.selected { background: #e8f8f5; }
  tbody tr.row-low  { background: #fff0f0; }
  tbody tr.row-low:hover { background: #ffe0e0; }
  .r { text-align: right; font-feature-settings: 'tnum'; }
  .muted { color: var(--color-text-muted); }
  .empty { text-align: center; color: var(--color-text-disabled); padding: 24px; }

  /* Output badge */
  .badge { display: inline-block; padding: 2px 8px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 700; }
  .badge.green  { background: #e8f5ee; color: var(--color-accent-green); }
  .badge.orange { background: #fef4e8; color: var(--color-accent-orange); }
  .badge.red    { background: #fdecea; color: var(--color-brand-red); }

  /* Utilization column */
  .td-status { white-space: nowrap; }
  .status-badge {
    display: inline-block; padding: 2px 9px; border-radius: 4px;
    font-size: 10px; font-weight: 800; letter-spacing: .6px;
    text-transform: uppercase; white-space: nowrap;
  }
  .td-util { min-width: 72px; }

  /* Events column */
  .td-events { max-width: 420px; }
  .ev-wrap   { display: flex; flex-wrap: wrap; gap: 3px; }
  .ev-pill {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 6px; border-radius: 4px;
    font-size: 10px; font-weight: 600; white-space: nowrap;
    cursor: default; line-height: 1.4;
  }
  .pill-abbr { font-weight: 700; }
  .pill-time { opacity: .85; font-size: 9px; font-weight: 500; }
  .pill-dur  { opacity: .7;  font-size: 9px; font-weight: 500; }
</style>
