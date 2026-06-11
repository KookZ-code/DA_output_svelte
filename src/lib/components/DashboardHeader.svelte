<script lang="ts">
  // Top header — title + filters (date, shift, package multi-select) + refresh status.
  import { dashboard, resetDrilldown } from '$lib/stores/dashboard.svelte';
  import type { Shift } from '$lib/types/dashboard';
  import PackageDropdown from './PackageDropdown.svelte';

  type Props = {
    packages: string[];
    loading: boolean;
    lastUpdated: string;
    onChange: () => void;
  };
  const { packages, loading, lastUpdated, onChange }: Props = $props();

  function setShift(s: Shift) {
    if (dashboard.shift === s) return;
    dashboard.shift = s;
    resetDrilldown();
    onChange();
  }

  function onDateChange(e: Event) {
    const v = (e.target as HTMLInputElement).value;
    if (!v) return;
    dashboard.date = v;
    resetDrilldown();
    onChange();
  }

  function onPkgChange() {
    resetDrilldown();
    onChange();
  }
</script>

<header class="header">
  <div class="header-left">
    <h1>Die Attach Output Monitor</h1>
    <div class="subtitle">Assembly : MTAI Plant</div>
  </div>

  <div class="header-right">
    <div class="filter-group">
      <span class="filter-label">Date</span>
      <input
        type="date"
        class="filter-input"
        value={dashboard.date}
        onchange={onDateChange}
      />
    </div>

    <div class="divider"></div>

    <div class="filter-group">
      <span class="filter-label">Shift</span>
      <div class="shift-toggle">
        <button
          type="button"
          class="shift-btn"
          class:active={dashboard.shift === 'N'}
          onclick={() => setShift('N')}>N</button
        >
        <button
          type="button"
          class="shift-btn"
          class:active={dashboard.shift === 'D'}
          onclick={() => setShift('D')}>D</button
        >
      </div>
    </div>

    <div class="divider"></div>

    <div class="filter-group">
      <span class="filter-label">Package</span>
      <PackageDropdown {packages} onChange={onPkgChange} />
    </div>

    <div class="divider"></div>

    <a
      href="/testSvelte/monitor?date={dashboard.date}&shift={dashboard.shift}"
      class="monitor-btn"
      target="_blank"
      rel="noopener"
    >Machine Monitor</a>

    <div class="divider"></div>

    <div class="refresh-info">
      <span class="dot" class:loading></span>
      <span>{lastUpdated}</span>
    </div>
  </div>
</header>

<style>
  .header {
    background: var(--color-primary);
    color: #fff;
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }
  .header-left h1 {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.3px;
    line-height: 22px;
  }
  .header-left .subtitle {
    font-size: 12px;
    color: var(--color-accent-blue);
    margin-top: 2px;
    letter-spacing: 0.04em;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .filter-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .filter-label {
    font-size: 11px;
    color: var(--color-accent-blue);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 700;
  }
  .filter-input {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    outline: none;
    color-scheme: dark;
    height: 32px;
  }
  .filter-input:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  .divider {
    width: 1px;
    height: 28px;
    background: rgba(255, 255, 255, 0.2);
  }
  .monitor-btn {
    color: #fff;
    text-decoration: none;
    font-size: 12px;
    font-weight: 700;
    padding: 5px 12px;
    border: 1px solid rgba(255,255,255,0.4);
    border-radius: var(--radius-sm);
    white-space: nowrap;
    letter-spacing: 0.02em;
  }
  .monitor-btn:hover { background: rgba(255,255,255,0.12); }
  .shift-toggle {
    display: flex;
    border-radius: var(--radius-sm);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.25);
  }
  .shift-btn {
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    font-family: inherit;
    transition:
      background 0.15s,
      color 0.15s;
    height: 32px;
  }
  .shift-btn.active {
    background: var(--color-primary-hover);
    color: #fff;
  }
  .shift-btn:hover:not(.active) {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  .refresh-info {
    font-size: 11px;
    color: var(--color-accent-blue);
    display: inline-flex;
    align-items: center;
  }
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--color-accent-green);
    border-radius: 50%;
    margin-right: 6px;
    animation: pulse 2s infinite;
  }
  .dot.loading {
    background: var(--color-accent-orange);
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
</style>
