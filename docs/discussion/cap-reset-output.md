# Decision: Reset-aware output when capillary (cap) is changed mid-lot

## Problem

`bonded_unit` is a cumulative counter tied to **capillary lifetime**. When the
capillary is replaced (machine goes down for a cap change) in the middle of a
lot, the counter resets to `0` while `lot_id` stays the same. Output is computed
from `bonded_unit` deltas, so the reset corrupts the numbers.

Observed in lot `MTAI270802525.100`:

| Time  | Bonded | Current delta | Correct |
|-------|--------|---------------|---------|
| 11:06 | 3,772  | +372          | +372    |
| 12:03 | 233    | **−3,539**    | +233    |
| 13:09 | 598    | +365          | +365    |

## Two symptoms (same root cause)

1. **Negative delta in drill-3 display** — `records.ts` uses
   `bonded_unit - LAG(bonded_unit)` with no clamp → shows `−3,539`.
2. **Silent under-counting in totals** — `hourly.ts` and `summary.ts` use
   `MAX(bonded_unit) - baseline`. The `MAX` caps at the pre-reset peak, so all
   production *after* the cap change (e.g. `598`) is dropped from KPI cards and
   the hourly chart, with no visible error.

## Decision

Replace `current - previous` / `MAX - baseline` with a **reset-aware** rule
applied over the time-ordered scans within a lot:

```
if cur >= prev:  output += cur - prev   # normal increment
else:            output += cur          # reset detected — counter restarted at 0
```

- Handles any number of cap changes within a lot.
- Assumption: a *decrease* in `bonded_unit` within the same `lot_id` (voided
  rows already excluded) only happens on a cap reset — never legitimately.

## Accepted limitation (chosen by user)

In the interval where the reset happens we see the value *before* (3,772) and
*after* (233) the reset, but not the pre-reset peak. We attribute only the
post-reset value (`233`) to that interval. This **under-counts the unmeasured
pre-reset tail** (~50–100 units per cap change). Chosen deliberately: do not
inject `UPH × time` estimates into measured data — keep it a true lower bound.

## Implementation

New shared helper `src/lib/server/queries/delta.ts`:

- `scanDelta(prev, cur)` — per-scan reset-aware production.
- `resetAwareTotal(baseline, values[])` — sum over an ordered series.

Apply across the three queries:

| File          | Change                                                                 |
|---------------|------------------------------------------------------------------------|
| `records.ts`  | Wrap the SQL delta expression in `CASE … ELSE bonded_unit END` (display, per-scan). |
| `hourly.ts`   | Replace per-slot `MAX(bonded)` with a reset-aware walk up to `slotEnd`, using the existing baseline as the initial `prev`. |
| `summary.ts`  | Replace `MAX(0, MAX(bonded) - baseline)` per lot with `resetAwareTotal`; rewritten to load rows + pre-shift baselines and aggregate in JS (the SQL `MAX` form cannot express reset-aware sum cleanly). |

Existing baseline logic (pre-shift value, carry-over heuristic, genuinely-new
lot → 0) is preserved unchanged — it becomes the initial `prev` for the walk.

## Verification

- Unit-test `delta.ts` (`delta.test.ts`): no-reset series, single reset,
  multiple resets, baseline carry-over.
- Re-check lot `MTAI270802525.100`: drill-3 delta at 12:03 = `+233`;
  shift total includes the post-reset `598`.
