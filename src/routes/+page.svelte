<!--
  Die Attach Output Monitor — DA process output dashboard.
  Single page that orchestrates header / KPIs / chart / 3 drill-down panels.
-->
<script lang="ts">
  import { base } from '$app/paths';
  import { onMount } from 'svelte';
  import { dashboard, resetDrilldown } from '$lib/stores/dashboard.svelte';
  import type {
    SummaryResponse,
    HourlyResponse,
    PackageRow,
    MachineRow,
    MachinesResponse,
    RawRecord,
    RecordsResponse,
  } from '$lib/types/dashboard';

  import DashboardHeader from '$lib/components/DashboardHeader.svelte';
  import KpiCards from '$lib/components/KpiCards.svelte';
  import MainChart from '$lib/components/MainChart.svelte';
  import PackagePanel from '$lib/components/PackagePanel.svelte';
  import MachineTable from '$lib/components/MachineTable.svelte';
  import RecordsTable from '$lib/components/RecordsTable.svelte';

  const REFRESH_MS = 5 * 60 * 1000;

  let summary = $state<SummaryResponse | null>(null);
  let hourly = $state<HourlyResponse | null>(null);
  let packageRows = $state<PackageRow[] | null>(null);
  let machineRows = $state<MachineRow[] | null>(null);
  let requiredMc = $state<number>(0);
  let targetBonded = $state<number>(0);
  let recordRows = $state<RawRecord[] | null>(null);
  let prevTailRows = $state<RawRecord[]>([]);
  let drawerOpen = $state(false);

  let packagesList = $state<string[]>([]);
  let loading = $state(false);
  let lastUpdated = $state('Loading…');
  let chartTitle = $state('Cumulative Output vs Target');

  function pkgQs(): string {
    return dashboard.pkgFilter.length ? `&packages=${dashboard.pkgFilter.join(',')}` : '';
  }

  function shiftQs(): string {
    return `date=${dashboard.date}&shift=${dashboard.shift}${pkgQs()}`;
  }

  async function fetchAll() {
    loading = true;
    try {
      const [s, h] = await Promise.all([
        fetch(`${base}/api/summary?${shiftQs()}`).then((r) => r.json() as Promise<SummaryResponse>),
        fetch(`${base}/api/hourly?${shiftQs()}`).then((r) => r.json() as Promise<HourlyResponse>),
      ]);
      summary = s;
      hourly = h;
      chartTitle = `Cumulative Output vs Target — ${s.shift_label}`;

      // Build packagesList from first non-empty hourly response — never shrinks
      // it back to [], so changing the pkg filter doesn't make options vanish.
      const keys = Object.keys(h.packages);
      if (keys.length > 0) {
        const merged = new Set<string>([...packagesList, ...keys]);
        packagesList = [...merged].sort();
      }

      lastUpdated = `Updated ${new Date().toLocaleTimeString()} · Auto-refresh 5 min`;
    } catch (e) {
      lastUpdated = 'Error — retrying in 5 min';
      console.error(e);
    } finally {
      loading = false;
    }
  }

  async function fetchPackages(hour: number) {
    const qs = `date=${dashboard.date}&shift=${dashboard.shift}&hour=${hour}${pkgQs()}`;
    try {
      packageRows = await fetch(`${base}/api/packages?${qs}`).then(
        (r) => r.json() as Promise<PackageRow[]>
      );
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchMachines(hour: number, pkg: string) {
    const qs = `date=${dashboard.date}&shift=${dashboard.shift}&hour=${hour}&package=${encodeURIComponent(pkg)}`;
    try {
      const res = await fetch(`${base}/api/machines?${qs}`).then(
        (r) => r.json() as Promise<MachinesResponse>
      );
      machineRows = res.rows;
      requiredMc = res.required_mc;
      targetBonded = res.target_bonded;
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchRecords(machineId: string, pkg: string) {
    const qs =
      `date=${dashboard.date}&shift=${dashboard.shift}` +
      `&machine_id=${encodeURIComponent(machineId)}&package=${encodeURIComponent(pkg)}`;
    try {
      const res = await fetch(`${base}/api/records?${qs}`).then(
        (r) => r.json() as Promise<RecordsResponse>
      );
      recordRows = res.current;
      prevTailRows = res.prev_tail;
      drawerOpen = true;
    } catch (e) {
      console.error(e);
    }
  }

  // ─── Drill-down handlers ───────────────────────────────────────────────────
  function selectHour(hour: number) {
    dashboard.selectedHour = hour;
    dashboard.selectedPkg = null;
    dashboard.selectedMachine = null;
    machineRows = null;
    recordRows = null;
    fetchPackages(hour);
  }

  function selectPkg(pkg: string) {
    dashboard.selectedPkg = pkg;
    dashboard.selectedMachine = null;
    recordRows = null;
    if (dashboard.selectedHour != null) fetchMachines(dashboard.selectedHour, pkg);
  }

  function selectMachine(machineId: string) {
    dashboard.selectedMachine = machineId;
    if (dashboard.selectedHour != null && dashboard.selectedPkg != null) {
      fetchMachines(dashboard.selectedHour, dashboard.selectedPkg);
      fetchRecords(machineId, dashboard.selectedPkg);
    }
  }


  function closeDrawer() {
    drawerOpen = false;
    dashboard.selectedMachine = null;
    recordRows = null;
    prevTailRows = [];
  }

  // Derive the events for the currently selected machine
  const selectedMachineEvents = $derived(
    machineRows?.find(r => r.machine_id === dashboard.selectedMachine)?.events ?? []
  );

  function onFiltersChanged() {
    resetDrilldown();
    packageRows = null;
    machineRows = null;
    recordRows = null;
    fetchAll();
  }

  onMount(() => {
    fetchAll();
    const id = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>DA Output Monitor</title>
</svelte:head>

<DashboardHeader
  packages={packagesList}
  {loading}
  {lastUpdated}
  onChange={onFiltersChanged}
/>

<KpiCards {summary} />

<MainChart {hourly} title={chartTitle} onSelectHour={selectHour} />

<section class="drill-row">
  <PackagePanel rows={packageRows} hour={dashboard.selectedHour} onSelect={selectPkg} />
  <MachineTable rows={machineRows} pkg={dashboard.selectedPkg} {requiredMc} {targetBonded} onSelect={selectMachine} />
</section>

<RecordsTable
  rows={recordRows}
  prevTail={prevTailRows}
  events={selectedMachineEvents}
  machineId={dashboard.selectedMachine}
  shiftStart={summary?.window_start ?? ''}
  open={drawerOpen}
  onClose={closeDrawer}
/>

<style>
  .drill-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    padding: 16px 24px 0;
    max-width: var(--content-max);
    margin: 0 auto;
    width: 100%;
  }
  @media (max-width: 1024px) {
    .drill-row {
      grid-template-columns: 1fr;
    }
  }
</style>
