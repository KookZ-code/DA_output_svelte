<script lang="ts">
  // Stacked bar (per package) + dashed target line + custom labels above each
  // stacked bar showing total + signed % vs target. Click → drill down by hour.
  import { onMount } from 'svelte';
  import {
    Chart,
    BarController,
    LineController,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler,
    type Chart as ChartType,
    type ChartConfiguration,
    type Plugin,
  } from 'chart.js';
  import type { HourlyResponse } from '$lib/types/dashboard';
  import { dashboard, getCutoffIndex } from '$lib/stores/dashboard.svelte';

  Chart.register(
    BarController,
    LineController,
    BarElement,
    LineElement,
    PointElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler
  );

  type Props = {
    hourly: HourlyResponse | null;
    title: string;
    onSelectHour: (hour: number) => void;
  };
  const { hourly, title, onSelectHour }: Props = $props();

  // Microchip tokens — pulled from CSS at runtime via getComputedStyle would be
  // ideal, but for Chart.js (canvas) we hard-reference them once here. They're
  // the same hex values defined in app.css → DESIGN.md.
  const PKG_COLORS = [
    '#157EAC', '#41B6E6', '#6CC24A', '#9CD584',
    '#F68D2E', '#F5B57F', '#7B5CB0', '#B395D0',
    '#1C355E', '#34A085', '#DA291C', '#838E93',
  ];
  const TARGET_COLOR = '#DA291C';
  const TEXT_COLOR = '#34333E';
  const POSITIVE_COLOR = '#6CC24A';
  const NEGATIVE_COLOR = '#DA291C';

  let canvasEl = $state<HTMLCanvasElement>();
  let chart: ChartType | null = null;

  // Custom plugin: draw "total + (±%vs target)" labels above each stacked bar.
  // Ported verbatim from WB_Dashboard/static/app.js stackedLabelsPlugin.
  const stackedLabelsPlugin: Plugin = {
    id: 'stackedLabels',
    afterDatasetsDraw(c) {
      const ctx = c.ctx;
      const datasets = c.data.datasets;
      const targetIdx = datasets.findIndex((d) => d.label === 'Target');

      (c.data.labels ?? []).forEach((_, i) => {
        let total = 0;
        datasets.forEach((ds, di) => {
          if (di === targetIdx) return;
          const v = ds.data[i] as number | null | undefined;
          if (v != null && v > 0) total += v;
        });
        if (total === 0) return;

        const targetVal =
          targetIdx >= 0 ? ((datasets[targetIdx].data[i] as number | null) ?? 0) : 0;
        const diffPct = targetVal > 0 ? ((total - targetVal) / targetVal) * 100 : null;
        const isAhead = diffPct !== null && diffPct >= 0;

        let topY = Infinity;
        datasets.forEach((ds, di) => {
          if (di === targetIdx) return;
          if (ds.data[i] == null) return;
          const meta = c.getDatasetMeta(di);
          const point = meta.data[i];
          if (point) topY = Math.min(topY, point.y);
        });
        if (!Number.isFinite(topY)) return;

        const x = c.getDatasetMeta(0).data[i]?.x;
        if (x == null) return;

        const totalStr = total >= 1000 ? (total / 1000).toFixed(1) + 'K' : String(total);
        const sign = isAhead ? '+' : '';
        const pctStr = diffPct !== null ? `(${sign}${diffPct.toFixed(1)}%)` : '';
        const pctColor = isAhead ? POSITIVE_COLOR : NEGATIVE_COLOR;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = "bold 11px 'Open Sans', sans-serif";
        ctx.fillStyle = TEXT_COLOR;
        ctx.textBaseline = 'bottom';
        ctx.fillText(totalStr, x, topY - 14);
        if (pctStr) {
          ctx.font = "10px 'Open Sans', sans-serif";
          ctx.fillStyle = pctColor;
          ctx.fillText(pctStr, x, topY - 3);
        }
        ctx.restore();
      });
    },
  };

  function buildConfig(h: HourlyResponse): ChartConfiguration {
    // Chart.js mutates data arrays via Object.defineProperty (listenArrayEvents).
    // Svelte 5 $state proxies fix descriptors, so passing them directly throws
    // state_descriptors_fixed. Clone every array we hand to Chart.js.
    const labels = [...h.hours];
    const cutoff = getCutoffIndex(labels);
    const packages = Object.keys(h.packages).sort();
    const colorMap = new Map<string, string>();
    packages.forEach((p, i) => colorMap.set(p, PKG_COLORS[i % PKG_COLORS.length]));

    const masked = (arr: number[]) =>
      arr.map((v, i) => (cutoff < 0 || i > cutoff ? null : v));

    const datasets: ChartConfiguration['data']['datasets'] = packages.map((pkg) => ({
      type: 'bar',
      label: pkg,
      data: masked(h.packages[pkg]),
      backgroundColor: colorMap.get(pkg) ?? '#157EAC',
      stack: 'output',
      borderRadius: 2,
      borderSkipped: false,
    }));

    datasets.push({
      type: 'line',
      label: 'Target',
      data: [...h.target_cumulative],
      borderColor: TARGET_COLOR,
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 3,
      pointBackgroundColor: TARGET_COLOR,
      fill: false,
      order: -1,
      spanGaps: false,
    });

    return {
      type: 'bar',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { top: 36 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              font: { size: 11, family: "'Open Sans', sans-serif" },
              padding: 14,
              color: TEXT_COLOR,
            },
          },
          tooltip: {
            filter: (item) => item.dataset.label === 'Target',
            displayColors: false,
            callbacks: {
              title: (items) => items[0]?.label ?? '',
              label: () => '',
              footer: (items) => {
                if (!items.length) return '';
                const idx = items[0].dataIndex;
                const c = items[0].chart;
                let total = 0;
                c.data.datasets.forEach((ds) => {
                  if (ds.label === 'Target') return;
                  const v = ds.data[idx] as number | null | undefined;
                  if (v != null) total += v;
                });
                if (total === 0) return '';
                const tgt = (items[0].parsed.y as number) ?? 0;
                const sign = total >= tgt ? '+' : '';
                const diff = tgt > 0 ? `${sign}${(((total - tgt) / tgt) * 100).toFixed(1)}%` : '—';
                return [
                  `Output    : ${total.toLocaleString()}`,
                  `Target    : ${tgt.toLocaleString()}`,
                  `vs Target : ${diff}`,
                ];
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11, family: "'Open Sans', sans-serif" }, color: '#586674' },
            stacked: true,
          },
          y: {
            ticks: {
              font: { size: 11, family: "'Open Sans', sans-serif" },
              color: '#586674',
              callback: (v) => {
                const n = typeof v === 'number' ? v : Number(v);
                return n >= 1000 ? (n / 1000).toFixed(0) + 'K' : String(n);
              },
            },
            title: {
              display: true,
              text: 'Cumulative Units',
              font: { size: 11, family: "'Open Sans', sans-serif" },
              color: '#586674',
            },
            stacked: true,
          },
        },
        onClick: (_e, elements, c) => {
          if (!elements.length) return;
          const el = elements.find(
            (x) => c.data.datasets[x.datasetIndex]?.label !== 'Target'
          );
          if (!el || !hourly) return;
          const currentCutoff = getCutoffIndex(hourly.hours);
          if (currentCutoff >= 0 && el.index > currentCutoff) return;
          const label = hourly.hours[el.index];
          if (!label) return;
          onSelectHour(parseInt(label.split(':')[0], 10));
        },
      },
      plugins: [stackedLabelsPlugin],
    };
  }

  onMount(() => {
    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  $effect(() => {
    void dashboard.date;
    void dashboard.shift;
    if (!hourly || !canvasEl) return;
    if (!chart) {
      chart = new Chart(canvasEl, buildConfig(hourly));
    } else {
      const cfg = buildConfig(hourly);
      chart.data.labels = cfg.data.labels;
      chart.data.datasets = cfg.data.datasets;
      chart.update('none');
    }
  });
</script>

<section class="chart-card">
  <div class="chart-header">
    <span class="chart-title">{title}</span>
    <span class="chart-hint">Click a bar to drill down by package</span>
  </div>
  <div class="canvas-wrap">
    <canvas bind:this={canvasEl}></canvas>
  </div>
</section>

<style>
  .chart-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-sm);
    padding: 16px 20px;
    margin: 16px auto 0;
    max-width: var(--content-max);
    width: calc(100% - 48px);
  }
  .chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .chart-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--color-primary);
  }
  .chart-hint {
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .canvas-wrap {
    height: 340px;
  }
</style>
