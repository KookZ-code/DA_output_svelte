<script lang="ts">
  // Drill 1 — package breakdown for the selected hour. Progress bars colored
  // by pace (green ≥ on target, orange ≥ 70% of pro-rated target, else red).
  import type { PackageRow } from '$lib/types/dashboard';
  import { dashboard } from '$lib/stores/dashboard.svelte';
  import { fmtInt, fmtSignedPct } from '$lib/utils/format';

  type SortCol = 'a01' | 'package' | 'wip' | 'doi' | 'plan_per_shift' | 'target' | 'bonded' | 'pct';

  type Props = {
    rows: PackageRow[] | null;
    hour: number | null;
    onSelect: (pkg: string) => void;
  };
  const { rows, hour, onSelect }: Props = $props();

  // Default order follows the A01 package list (a01Seq).
  let sortCol = $state<SortCol>('a01');
  let sortAsc = $state(true);

  function toggleSort(col: SortCol) {
    if (sortCol === col) sortAsc = !sortAsc;
    else { sortCol = col; sortAsc = col === 'package'; }
  }

  function sortIndicator(col: SortCol): string {
    if (sortCol !== col) return '';
    return sortAsc ? ' ↑' : ' ↓';
  }

  const sorted = $derived.by(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      let diff: number;
      if (sortCol === 'a01') diff = (a.a01Seq ?? Infinity) - (b.a01Seq ?? Infinity);
      else if (sortCol === 'package') diff = a.package.localeCompare(b.package);
      else if (sortCol === 'wip') diff = (a.wip ?? -1) - (b.wip ?? -1);
      else if (sortCol === 'doi') diff = (a.doi ?? -1) - (b.doi ?? -1);
      else diff = (a[sortCol] as number) - (b[sortCol] as number);
      return sortAsc ? diff : -diff;
    });
  });

  const maxBonded = $derived(rows && rows.length > 0 ? Math.max(...rows.map((r) => r.bonded), 1) : 1);

  function paceColor(r: PackageRow): string {
    if (r.plan_per_shift === 0) return 'var(--color-brand-red)';
    if (r.bonded >= r.target) return 'var(--color-accent-green)';
    if (r.bonded >= r.target * 0.7) return 'var(--color-accent-orange)';
    return 'var(--color-brand-red)';
  }
</script>

{#if rows == null || hour == null}
  <div class="placeholder">
    <div class="icon">↑</div>
    <span>Click a bar above to see package breakdown</span>
  </div>
{:else}
  <div class="active">
    <div class="label">▼ {hour}:00 hr — by Package</div>
    <div class="ph-row">
      <button class="ph-pkg ph-sort" onclick={() => toggleSort('package')}>Package{sortIndicator('package')}</button>
      <div class="ph-bar"></div>
      <button class="ph-num ph-sort" onclick={() => toggleSort('wip')}>WIP{sortIndicator('wip')}</button>
      <button class="ph-num ph-sort" onclick={() => toggleSort('doi')}>DOI{sortIndicator('doi')}</button>
      <button class="ph-num ph-sort" onclick={() => toggleSort('plan_per_shift')}>Plan/Shift{sortIndicator('plan_per_shift')}</button>
      <button class="ph-num ph-sort" onclick={() => toggleSort('target')}>Target{sortIndicator('target')}</button>
      <button class="ph-num ph-sort" onclick={() => toggleSort('bonded')}>Output{sortIndicator('bonded')}</button>
      <div class="ph-num">Missing</div>
      <button class="ph-pct ph-sort" onclick={() => toggleSort('pct')}>vs Pace{sortIndicator('pct')}</button>
    </div>
    <div class="list">
      {#each sorted as r (r.package)}
        <button
          type="button"
          class="row"
          class:selected={r.package === dashboard.selectedPkg}
          onclick={() => onSelect(r.package)}
        >
          <div class="pkg">{r.package}</div>
          <div class="bar-wrap">
            <div
              class="bar-fill"
              style:width="{Math.min(r.target > 0 ? (r.bonded / r.target) * 100 : 0, 110)}%"
              style:background={paceColor(r)}
            ></div>
            <div class="bar-target-line"></div>
          </div>
          <div class="num wip">{r.wip != null ? fmtInt(r.wip) : '—'}</div>
          <div class="num doi" class:doi-low={r.doi != null && r.doi < 1}>{r.doi != null ? r.doi.toFixed(1) : '—'}</div>
          <div class="num">{r.plan_per_shift > 0 ? fmtInt(r.plan_per_shift) : '—'}</div>
          <div class="num muted">{r.target > 0 ? fmtInt(r.target) : '—'}</div>
          <div class="num strong">{fmtInt(r.bonded)}</div>
          {#if r.target > 0}
            {@const gap = r.target - r.bonded}
            <div class="num missing" style:color={gap > 0 ? 'var(--color-brand-red)' : 'var(--color-accent-green)'}>
              {gap > 0 ? fmtInt(gap) : '—'}
            </div>
          {:else}
            <div class="num muted">—</div>
          {/if}
          <div class="pct" style:color={paceColor(r)}>
            {r.target > 0 ? fmtSignedPct(r.pct, 0) : '—'}
          </div>
        </button>
      {/each}
      {#if rows.length === 0}
        <div class="empty">No production in this slot</div>
      {/if}
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--color-text-disabled);
    font-size: 13px;
    gap: 8px;
  }
  .icon {
    font-size: 30px;
  }
  .active {
    border: 1px solid var(--color-primary-hover);
  }
  .label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-primary-hover);
    margin-bottom: 10px;
  }

  .ph-row,
  .row {
    display: grid;
    grid-template-columns: 80px 1fr 64px 48px 70px 70px 70px 72px 52px;
    align-items: center;
    gap: 10px;
    font-size: 12px;
  }
  .ph-row {
    color: var(--color-text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 4px 4px;
    border-bottom: 1px solid var(--color-border);
    font-size: 10px;
  }
  .ph-num,
  .ph-pct {
    text-align: right;
  }
  .ph-sort {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .ph-sort:hover {
    color: var(--color-primary);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }
  .row {
    background: transparent;
    border: none;
    padding: 5px 4px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    font-family: inherit;
  }
  .row:hover {
    background: var(--color-surface-alt);
  }
  .row.selected {
    background: #e8f0fa;
  }
  .pkg {
    color: var(--color-text-dark);
    font-weight: 600;
  }
  .bar-wrap {
    position: relative;
    background: var(--color-surface-gray);
    border-radius: var(--radius-sm);
    height: 14px;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: var(--radius-sm);
    transition: width 0.3s ease;
  }
  /* Target line at 100% mark — shows where "on pace" is */
  .bar-target-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(100% / 110 * 100);
    width: 2px;
    background: var(--color-border-strong);
    opacity: 0.6;
  }
  .num {
    text-align: right;
    color: var(--color-text-muted);
    font-feature-settings: 'tnum';
  }
  .num.strong {
    color: var(--color-text-body);
    font-weight: 700;
  }
  .num.missing {
    font-weight: 700;
    font-feature-settings: 'tnum';
  }
  .num.muted {
    color: var(--color-text-disabled);
  }
  /* DOI below 1 day = low inventory → warn in red */
  .num.doi-low {
    color: var(--color-brand-red);
    font-weight: 700;
  }
  .pct {
    text-align: right;
    font-weight: 600;
    font-feature-settings: 'tnum';
  }
  .empty {
    text-align: center;
    color: var(--color-text-disabled);
    padding: 24px;
    font-size: 13px;
  }
</style>
