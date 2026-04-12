# BOQ default layout (baseline)

**Saved state:** 2026-04-04 — canonical spec for the Bill of Quantities editor and table. Prefer updating this file when layout behavior is an intentional product change.

## Table frame

- **Border:** `1px solid #bbb` on `.boq-table`, `border-collapse: collapse`, uniform `1px` cell borders on `.boq-th` / `.boq-td`.
- **Wrapper:** background only; no second outer border on `.boq-table-wrapper` (avoids double frame lines).

## Line numbering (ลำดับ)

- **Section** rows: `1`, `2`, … (ข้อ).
- **Sub-rows:** `1.1`, `1.2`, … under each section.
- **Nested:** `1.1.1`, `1.1.2`, … under a parent line — stored as `children[]` on each line item; deeper levels (e.g. `1.1.1.1`) use the same structure.
- In edit mode, the **blue +** on each line adds a nested child under that line; the **green +** on the first line of a section still adds a new sibling `1.2`, `1.3`, … at section level.

## อ้างอิง ID (reference columns)

- **Collapsible** — `−` in the “อ้างอิง ID” header hides เลขหน้า / รหัส; a narrow column with **`+`** next to “ลำดับที่” restores them. UI state only (not saved in BOQ JSON unless added later).

## Column order (right side)

After **ค่าวัสดุและแรงงาน** (total): **หมายเหตุ** (notes), then **action** (edit/delete/add buttons) — **buttons are the last column**.

## Alignment note

- Sub-row numbers (`1.1`, `1.2`, …) use **inset box-shadow** for the left stripe (`.boq-td-sub-no`), not a thick `border-left`, so the first column stays aligned under `border-collapse: collapse`.

## Default column widths (pixels)

Source: `DEFAULT_WIDTHS` in `app/dashboard/boq/[id]/page.tsx`:

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
| note       | 140     |
| action     | 100     |

Header resize handles (`RH`) adjust widths in session; they are not persisted in BOQ JSON unless that is added later.

## Related files

- `app/dashboard/boq/boq.css` — table, headers, group/section rows, summary rows, modals.
- `app/dashboard/boq/[id]/page.tsx` — editor, `colgroup`, row cell structure, footer formulas.
- `app/dashboard/boq/page.tsx` — BOQ list dashboard.
