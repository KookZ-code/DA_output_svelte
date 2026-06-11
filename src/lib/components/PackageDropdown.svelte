<script lang="ts">
  // Multi-select dropdown with search + "All Package" / "All QFN" presets.
  // Mirrors WB_Dashboard's pkg-panel behavior.
  import { dashboard } from '$lib/stores/dashboard.svelte';

  type Props = { packages: string[]; onChange: () => void };
  const { packages, onChange }: Props = $props();

  let open = $state(false);
  let search = $state('');
  let panelEl = $state<HTMLDivElement>();
  let btnEl = $state<HTMLButtonElement>();

  const qfnPackages  = $derived(packages.filter((p) =>  /QFN/i.test(p)));
  const leadPackages = $derived(packages.filter((p) => !/QFN/i.test(p)));

  const isAll = $derived(dashboard.pkgFilter.length === 0);
  const isQfn = $derived(
    !isAll &&
      qfnPackages.length > 0 &&
      dashboard.pkgFilter.length === qfnPackages.length &&
      qfnPackages.every((p) => dashboard.pkgFilter.includes(p))
  );
  const isLead = $derived(
    !isAll &&
      leadPackages.length > 0 &&
      dashboard.pkgFilter.length === leadPackages.length &&
      leadPackages.every((p) => dashboard.pkgFilter.includes(p))
  );

  const buttonLabel = $derived.by(() => {
    if (isAll)   return 'All Package ▾';
    if (isQfn)   return 'All QFN ▾';
    if (isLead)  return 'All Lead ▾';
    const n = dashboard.pkgFilter.length;
    return `${n} package${n > 1 ? 's' : ''} ▾`;
  });

  const filteredPackages = $derived(
    packages.filter((p) => p.toLowerCase().includes(search.toLowerCase()))
  );

  function toggle(pkg: string) {
    const i = dashboard.pkgFilter.indexOf(pkg);
    if (i >= 0) dashboard.pkgFilter.splice(i, 1);
    else dashboard.pkgFilter.push(pkg);
    onChange();
  }

  function selectAll() {
    dashboard.pkgFilter = [];
    onChange();
  }

  function selectQfn() {
    dashboard.pkgFilter = [...qfnPackages];
    onChange();
  }

  function selectLead() {
    dashboard.pkgFilter = [...leadPackages];
    onChange();
  }

  function onWindowClick(e: MouseEvent) {
    if (!open) return;
    const target = e.target as Node;
    if (panelEl?.contains(target) || btnEl?.contains(target)) return;
    open = false;
  }

  $effect(() => {
    if (open) {
      window.addEventListener('click', onWindowClick);
      return () => window.removeEventListener('click', onWindowClick);
    }
  });
</script>

<div class="pkg-wrap">
  <button
    bind:this={btnEl}
    type="button"
    class="filter-input pkg-btn"
    onclick={() => (open = !open)}
    aria-expanded={open}
  >
    {buttonLabel}
  </button>

  {#if open}
    <div bind:this={panelEl} class="pkg-panel" role="dialog">
      <div class="pkg-search-wrap">
        <input
          class="pkg-search"
          type="text"
          placeholder="Search…"
          bind:value={search}
        />
      </div>
      <div class="pkg-special">
        <button type="button" class="pkg-option special" onclick={selectAll}>
          <input type="checkbox" checked={isAll} readonly tabindex="-1" />
          <span>All Package</span>
        </button>
        <button type="button" class="pkg-option special" onclick={selectQfn}>
          <input type="checkbox" checked={isQfn} readonly tabindex="-1" />
          <span>All QFN</span>
        </button>
        {#if leadPackages.length > 0}
          <button type="button" class="pkg-option special" onclick={selectLead}>
            <input type="checkbox" checked={isLead} readonly tabindex="-1" />
            <span>All Lead</span>
          </button>
        {/if}
      </div>
      <div class="pkg-divider"></div>
      <div class="pkg-list">
        {#each filteredPackages as pkg (pkg)}
          <button type="button" class="pkg-option" onclick={() => toggle(pkg)}>
            <input
              type="checkbox"
              checked={isAll || dashboard.pkgFilter.includes(pkg)}
              readonly
              tabindex="-1"
            />
            <span>{pkg}</span>
          </button>
        {/each}
        {#if filteredPackages.length === 0}
          <div class="pkg-empty">No matches</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .pkg-wrap {
    position: relative;
  }
  .filter-input {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: #fff;
    border-radius: var(--radius-sm);
    padding: 6px 12px;
    font-size: 13px;
    cursor: pointer;
    outline: none;
    color-scheme: dark;
    height: 32px;
  }
  .filter-input:hover {
    background: rgba(255, 255, 255, 0.18);
  }
  .pkg-btn {
    white-space: nowrap;
    min-width: 140px;
    text-align: left;
  }
  .pkg-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--color-primary);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-sm);
    width: 240px;
    max-height: 340px;
    z-index: 200;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
  }
  .pkg-search-wrap {
    padding: 8px 10px 6px;
    flex-shrink: 0;
  }
  .pkg-search {
    width: 100%;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: var(--radius-sm);
    color: #fff;
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    font-family: inherit;
  }
  .pkg-search::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
  .pkg-special {
    flex-shrink: 0;
  }
  .pkg-divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.15);
    margin: 4px 0;
    flex-shrink: 0;
  }
  .pkg-list {
    overflow-y: auto;
    flex: 1;
    padding-bottom: 6px;
  }
  .pkg-option {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.9);
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .pkg-option:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .pkg-option.special {
    font-weight: 700;
    color: #fff;
  }
  .pkg-option input[type='checkbox'] {
    accent-color: var(--color-primary-hover);
    width: 13px;
    height: 13px;
    flex-shrink: 0;
    pointer-events: none;
  }
  .pkg-empty {
    padding: 12px;
    text-align: center;
    color: rgba(255, 255, 255, 0.5);
    font-size: 12px;
  }
</style>
