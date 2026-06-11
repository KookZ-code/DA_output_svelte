# Plan — Port WB Dashboard concept to SvelteKit

**Source:** `D:\claude\WB_Dashboard\` (Rust + Axum + plain HTML/JS + Chart.js)
**Target:** This SvelteKit project — replaces `src/routes/+page.svelte`
**Decision:** Read SQLite + XLSX directly from SvelteKit server (no Rust API in the loop)

---

## 1. Goal

Reproduce the **concept** of the Wire Bond Output Monitor in SvelteKit 5:

- 4-section single page (Header → KPI row → Main chart → Drill-down 3 panels)
- 3-level drill-down state machine (`hour → package → machine` → raw records)
- Auto shift detection (D 07:00–18:59, N 19:00–06:59 next day)
- Multi-select package filter with "All" / "All QFN" presets
- Auto-refresh every 5 min
- Cutoff logic — hide future hour bars on the active shift
- Cumulative-counter baseline rules + carry-over heuristic preserved (this is the *correctness principle*; without it numbers are wrong at shift boundaries)

Visual identity is **re-skinned to Microchip Industrial Light** (per `DESIGN.md`):

| WB Dashboard token | → | Microchip token |
|---|---|---|
| `#1B3A5C` (navy header) | → | `--color-primary` `#1C355E` |
| `#2E75B6` (blue accent) | → | `--color-primary-hover` `#157EAC` |
| `#2D8E4E` (green) | → | `--color-accent-green` `#6CC24A` |
| `#E67E22` (orange) | → | `--color-accent-orange` `#F68D2E` |
| `#C0392B` (red / behind-target) | → | `--color-brand-red` `#DA291C` |
| `#16A085` (records teal accent) | → | `--color-accent-blue` `#41B6E6` |
| Border-radius `8px` (cards) | → | `4px` (DESIGN.md rule — flat engineering aesthetic) |
| Font: Segoe UI | → | **Open Sans** |

Color *semantics* are preserved (green = on pace, orange = behind 15–30%, red = behind >30%) — only the exact hex values shift.

---

## 2. Architecture

```
Browser (Svelte 5 + Chart.js)
        │ fetch /api/{summary,hourly,packages,machines,records}
SvelteKit server endpoints (+server.ts)
        │ better-sqlite3            xlsx (sheetjs)
   ┌────▼─────┐               ┌────▼─────────┐
   │central.db│               │wb_plan.xlsx  │
   └──────────┘               └──────────────┘
   (D:\claude\WB_Dashboard\data\* — paths via .env)
```

**Why this shape:** mirrors the Rust handler-per-endpoint structure so SQL/logic ports 1:1. Endpoint contracts (`SummaryResponse`, `HourlyResponse`, `PackageRow`, `MachineRow`, `RawRecord`) are kept identical to `models.rs`.

---

## 3. New Dependencies (3)

| Package | Purpose | Why this one |
|---|---|---|
| `better-sqlite3` | Sync SQLite reads | Industry standard for Node-on-Windows SQLite, prebuilt binaries for Node 24, perfect for read-only dashboards |
| `xlsx` (SheetJS) | Parse `wb_plan.xlsx` | The only mature pure-JS option |
| `chart.js` | Stacked bar chart with target line | The original used Chart.js 4.4 — keeping the same library means the custom data-label plugin and tooltip footer logic ports verbatim |

No Svelte chart wrapper needed — Chart.js is instantiated inside an `$effect` on a `bind:this` canvas.

---

## 4. File Layout

```
src/
├── routes/
│   ├── +page.svelte                    ← REPLACED — dashboard shell
│   └── api/
│       ├── summary/+server.ts
│       ├── hourly/+server.ts
│       ├── packages/+server.ts
│       ├── machines/+server.ts
│       └── records/+server.ts
├── lib/
│   ├── types/
│   │   └── dashboard.ts                ← new — mirrors models.rs response types
│   ├── server/                         ← server-only (won't ship to client)
│   │   ├── config.ts                   ← reads DB_PATH / XLSX_PATH from env
│   │   ├── shift.ts                    ← port of shift.rs
│   │   ├── excel.ts                    ← port of excel.rs (load_plan + normalize_*)
│   │   ├── db.ts                       ← connection pool (single better-sqlite3 instance)
│   │   ├── plan-cache.ts               ← lazy singleton: loads xlsx once, refreshes on file mtime
│   │   └── queries/
│   │       ├── summary.ts
│   │       ├── hourly.ts
│   │       ├── packages.ts
│   │       ├── machines.ts
│   │       └── records.ts
│   ├── stores/
│   │   └── dashboard.svelte.ts         ← $state runes for {date, shift, selectedHour, selectedPkg, selectedMachine, pkgFilter}
│   ├── utils/
│   │   ├── shift-client.ts             ← initShiftFromNow / cutoff logic for client
│   │   └── format.ts                   ← number/percent/date formatters
│   └── components/
│       ├── DashboardHeader.svelte      ← title + filters
│       ├── PackageDropdown.svelte      ← multi-select with search + presets
│       ├── KpiCards.svelte             ← 4-card grid with conditional accent color
│       ├── MainChart.svelte            ← Chart.js stacked bar + target line + custom label plugin
│       ├── PackagePanel.svelte         ← progress bars
│       ├── MachineTable.svelte         ← table with vs-target badge
│       └── RecordsTable.svelte         ← raw scan rows with delta
└── app.css                             ← @theme tokens from DESIGN.md (Tailwind 4 hook — but we'll use plain CSS vars since current project uses scoped <style>)
```

---

## 5. Logic Port — Rust → TypeScript

| Rust source | TS target | Notes |
|---|---|---|
| `shift.rs` `shift_window` | `server/shift.ts` `shiftWindow()` | Plain date math; D = 7..=18, N = [19..23, 0..6] |
| `shift.rs` `current_shift` | `utils/shift-client.ts` `currentShift()` | Client-side — uses `new Date()` |
| `excel.rs` `normalize_package` | `server/excel.ts` `normalizePackage()` | Char-iteration logic identical; "8LEIAJ"→"8SOIJ" override preserved |
| `excel.rs` `normalize_mpc_key` | `server/excel.ts` `normalizeMpcKey()` | Last-paren extraction, 3-char alphanumeric check |
| `excel.rs` `load_plan` | `server/excel.ts` `loadPlan()` | Returns `{ rows, planMap, mpcPlanMap }` — wrapped in `plan-cache.ts` singleton |
| `db.rs` `query_summary` SQL | `queries/summary.ts` | SQL string copied verbatim (parametrized via `db.prepare(sql).get(...)`) |
| `db.rs` `query_hourly` (mixed SQL+Rust) | `queries/hourly.ts` | The Rust loop with `pre baselines + first_scan + carry-over check` ports to plain TS Map iteration. This is the most complex port. |
| `db.rs` `query_packages` SQL | `queries/packages.ts` | SQL verbatim + `mpcPlanMap.get(pkg) ?? planMap.get(base)` lookup |
| `db.rs` `query_machines` SQL | `queries/machines.ts` | SQL verbatim |
| `db.rs` `query_records` SQL | `queries/records.ts` | SQL verbatim — uses `LAG()` window function |

**SQL-injection safety:** the `pkg_filter` clause is built by string-concat in the Rust source. Same risk model in TS — values come from the dashboard's own dropdown (which was built from `query_hourly` results), not user free-text. Will keep the same posture and document it.

---

## 6. Component Behavior — Svelte 5 Runes

State store (`stores/dashboard.svelte.ts`):

```ts
export const dashboard = $state({
  date: '',
  shift: 'D' as 'D' | 'N',
  selectedHour: null as number | null,
  selectedPkg: null as string | null,
  selectedMachine: null as string | null,
  pkgFilter: [] as string[],
});
```

`MainChart.svelte` mounts Chart.js once; on `$effect` rerun (when `hourly` data changes) it calls `chart.data = ...; chart.update('none')`. The custom `stackedLabels` plugin is registered once per page.

Auto-refresh: a single `$effect` with `setInterval(fetchAll, 5*60_000)`.

Cutoff: `getCutoffIndex(hours)` runs client-side from `state.date`+`state.shift` and `new Date()` — masks future bars with `null`.

---

## 7. Env Configuration

`.env.example` will be updated with:

```
# WB Dashboard data sources (read directly by SvelteKit server)
DB_PATH=D:/claude/WB_Dashboard/data/central.db
XLSX_PATH=D:/claude/WB_Dashboard/data/wb_plan.xlsx
```

Server reads via `process.env.*` only. No hardcoded paths in source.

---

## 8. Out of Scope (will NOT port)

- Background sync from network share (`\\share\central.db` → local) — original `main.rs` did this every 60s. We will read the existing local file on every request. SvelteKit dev runs locally; if the user later wants sync, it goes in a separate task.
- Cargo build / Windows service packaging.
- The mock `mockup.html` file.

---

## 9. Verification Plan

1. `npm run check` clean (no TS errors, no `any`).
2. `npm run dev` starts; `http://localhost:5173/` loads dashboard.
3. KPI numbers match a manual `sqlite3` count for the current shift (or the previous N shift — whichever has data).
4. Click a chart bar → package panel renders. Click a package → machine table. Click a machine → records table.
5. Package dropdown: "All Package", "All QFN", individual checkboxes, search — all work.
6. Switch shift / date — drill-down panels reset, chart reloads.

---

## 10. Estimated Volume

~600 lines TS server logic + ~500 lines Svelte components + ~200 lines CSS = roughly **1300 LOC** total. This is non-trivial but tracks the source: the Rust project is ~1200 LOC handlers/db/excel and the static frontend is ~640 LOC.
