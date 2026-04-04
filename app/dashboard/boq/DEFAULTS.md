# BOQ default layout (baseline)

This file records the **intended default** for the Bill of Quantities editor and table chrome. Treat changes here as deliberate product decisions.

## Scroll and freeze

- **No column freeze** — there is no sticky/frozen pane (Excel-style). All columns scroll with the page if the viewport is narrow.
- **No horizontal scroll on the BOQ table wrapper** — `.boq-table-wrapper` uses `overflow-x: visible` so the framed table does not show its own horizontal scrollbar. The table is sized to fit the available width (`width: 100%`, `table-layout: fixed`).

## Table frame

- Outer edge: single border on `.boq-table` (`border-collapse: collapse`, uniform cell borders).
- Wrapper is a simple container (no second outer border on the wrapper).

## Column order (right side)

Rightmost columns are: **ค่าวัสดุและแรงงาน** → **หมายเหตุ** → **action** (edit buttons — last column).

## Default column widths (pixels)

Defined in `app/dashboard/boq/[id]/page.tsx` as `DEFAULT_WIDTHS`:

| Key        | Default |
| ---------- | ------- |
| no         | 60      |
| refPage    | 60      |
| refCode    | 60      |
| desc       | 380     |
| qty        | 64      |
| unit       | 48      |
| matPrice   | 95      |
| matAmt     | 95      |
| laborPrice | 95      |
| laborAmt   | 95      |
| total      | 92      |
| action     | 72      |
| note       | 140     |

Users can still resize via the header drag handles (`RH`); widths are not persisted unless saved with the document JSON where applicable.

## Related files

- `app/dashboard/boq/boq.css` — table, headers, summary rows, modals.
- `app/dashboard/boq/[id]/page.tsx` — editor, column widths, row structure.
- `app/dashboard/boq/page.tsx` — BOQ list dashboard.
