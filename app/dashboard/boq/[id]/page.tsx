'use client'

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Inter } from 'next/font/google'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { canDeleteBoq, canEditBoq, canSubmitBoq, canSignBoq } from '@/lib/auth/permissions'
import '../../dashboard.css'
import '../boq.css'

const interTitle = Inter({
  subsets: ['latin'],
  weight: ['400', '700'],
  display: 'swap',
})

/* ── Types ─────────────────────────────────────────────── */
type SubRow = {
  id: string; refPage: string; refCode: string; description: string
  width?: number | ''; length?: number | ''
  quantity: number | ''; unit: string; materialPrice: number | ''; laborPrice: number | ''; note: string
  /** Actual BOQ only: money adjustment vs approved plan (งานลด / งานเพิ่ม) */
  workDecrease?: number | ''
  workIncrease?: number | ''
  /** Nested lines e.g. 1.1.1 under 1.1 — blue + on each line */
  children: SubRow[]
}
type Section = { id: string; title: string; subRows: SubRow[] }
type Group   = { id: string; title: string; sections: Section[] }
/** Side panel: ราคาขาย (เป้า) / ต้นทุน / GP — GP Amount & ราคาขายสุดท้ายคำนวณจาก ราคาทุน + GP% */
type PlanSideRow = {
  id: string
  /** ผูกแถวแผนกับบรรทัด BOQ — แสดงเป็น 1.1.1 (id ของ SubRow) */
  linkedSubRowId: string
  listPrice: number | ''
  sub: string
  /** คอลัมน์ลูกใต้หัวกลุ่ม “เลขที่เอกสาร” */
  docIssue: string
  docTitle: string
  pricePerUnit: number | ''
  cost: number | ''
  gpPct: number | ''
}

type EditorSnapshot = {
  groups: Group[]
  planSideRows: PlanSideRow[]
  jobId: string
  boqTitle: string
  showMat: boolean
  matDetailHidden: boolean
  showLabor: boolean
  showRefId: boolean
  showDesc: boolean
  showQtyUnit: boolean
  showTotal: boolean
  showNote: boolean
  overheadPct: number
  vatPct: number
  discount: number | ''
  discountType: 'pct' | 'amount'
}

/* ── Helpers ─────────────────────────────────────────────── */
let _uid = 0
const uid = () => String(++_uid)
const emptySubRow = (): SubRow => ({
  id: `sr-${uid()}`,
  refPage: '', refCode: '', description: '',
  width: '', length: '',
  quantity: '', unit: '', materialPrice: '', laborPrice: '', note: '',
  workDecrease: '', workIncrease: '', children: [],
})
const emptySection = (): Section => { const id = `sec-${uid()}`; return { id, title: '', subRows: [emptySubRow()] } }
const emptyGroup   = (): Group   => ({ id: `grp-${uid()}`, title: '', sections: [emptySection()] })
const emptyPlanSideRow = (): PlanSideRow => ({
  id: `psr-${uid()}`,
  linkedSubRowId: '',
  listPrice: '',
  sub: '',
  docIssue: '',
  docTitle: '',
  pricePerUnit: '',
  cost: '',
  gpPct: '',
})

/** Triplex: editable blank slot row before a real `PlanSideRow` exists in state (id is not persisted). */
const TRIPLEX_PENDING_PLAN_ROW_PREFIX = 'triplex-slot:' as const
function triplexPendingPlanRowId(subRowId: string) {
  return `${TRIPLEX_PENDING_PLAN_ROW_PREFIX}${subRowId}`
}
function isTriplexPendingPlanRowId(rowId: string) {
  return rowId.startsWith(TRIPLEX_PENDING_PLAN_ROW_PREFIX)
}

/** Same 2:5:3 split as PLAN band row (`colSpan` 2+5+3 on 10 cols), scaled to main BOQ column count. */
function planBandColSpansForMain(total: number): [number, number, number] {
  if (total < 3) return [1, 1, Math.max(1, total - 2)]
  const n1 = Math.max(1, Math.floor((2 * total) / 10))
  const n3 = Math.max(1, Math.floor((3 * total) / 10))
  let n2 = Math.max(1, total - n1 - n3)
  let diff = total - (n1 + n2 + n3)
  if (diff > 0) return [n1 + diff, n2, n3]
  let a = n1
  let b = n2
  let c = n3
  let over = -diff
  while (over > 0 && b > 1) {
    b--
    over--
  }
  while (over > 0 && a > 1) {
    a--
    over--
  }
  while (over > 0 && c > 1) {
    c--
    over--
  }
  return [a, b, c]
}

function normalizePlanSideRow(r: unknown): PlanSideRow {
  const o = r && typeof r === 'object' ? (r as Record<string, unknown>) : {}
  const num = (v: unknown): number | '' => {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(v)
    return Number.isFinite(n) ? n : ''
  }
  let docIssue = typeof o.docIssue === 'string' ? o.docIssue : ''
  let docTitle = typeof o.docTitle === 'string' ? o.docTitle : ''
  const legacyDoc = typeof o.docNo === 'string' ? o.docNo : ''
  if (!docIssue && !docTitle && legacyDoc) {
    const nl = legacyDoc.indexOf('\n')
    if (nl >= 0) {
      docIssue = legacyDoc.slice(0, nl).trim()
      docTitle = legacyDoc.slice(nl + 1).trim()
    } else {
      docIssue = legacyDoc
    }
  }
  return {
    id: typeof o.id === 'string' && o.id ? o.id : `psr-${uid()}`,
    linkedSubRowId: typeof o.linkedSubRowId === 'string' ? o.linkedSubRowId : '',
    listPrice: num(o.listPrice),
    sub: typeof o.sub === 'string' ? o.sub : '',
    docIssue,
    docTitle,
    pricePerUnit: num(o.pricePerUnit),
    cost: num(o.cost),
    gpPct: num(o.gpPct),
  }
}

/** บรรทัด BOQ + เลขแสดงตรงกับคอลัมน์ลำดับที่ในตารางหลัก (1.1, 1.1.1, …) */
function flattenBoqLinesForPlanLink(groups: Group[]): { subRowId: string; displayNo: string }[] {
  const out: { subRowId: string; displayNo: string }[] = []
  let globalSecIdx = 0
  for (const g of groups) {
    for (const sec of g.sections) {
      globalSecIdx += 1
      const walk = (rows: SubRow[], prefix: string) => {
        rows.forEach((sr, i) => {
          const displayNo = `${prefix}.${i + 1}`
          out.push({ subRowId: sr.id, displayNo })
          walk(sr.children ?? [], displayNo)
        })
      }
      walk(sec.subRows, String(globalSecIdx))
    }
  }
  return out
}

function planSideRowDerived(r: PlanSideRow, costOverride?: number): { gpAmount: number; sellPrice: number } {
  const c = costOverride !== undefined ? Number(costOverride) || 0 : Number(r.cost) || 0
  const gpp = Number(r.gpPct) || 0
  const gpAmount = c * (gpp / 100)
  return { gpAmount, sellPrice: c + gpAmount }
}

/** Every BOQ `SubRow` by id (for tree / rollups). */
function buildSubRowByIdFromGroups(groups: Group[]): Map<string, SubRow> {
  const m = new Map<string, SubRow>()
  const visit = (sr: SubRow) => {
    m.set(sr.id, sr)
    for (const c of sr.children ?? []) visit(c)
  }
  for (const g of groups) for (const sec of g.sections) for (const r of sec.subRows) visit(r)
  return m
}

/** Effective cost for one plan row: pricePerUnit x BOQ quantity when available, else r.cost. */
function effectiveLeafCost(pr: PlanSideRow, ch: SubRow): number {
  const qty = ch.quantity === '' ? 0 : Number(ch.quantity) || 0
  if (qty !== 0 && pr.pricePerUnit !== '') return (Number(pr.pricePerUnit) || 0) * qty
  return Number(pr.cost) || 0
}

/** Sum of effective cost for every descendant BOQ line under `sr` (not including `sr`). */
function sumDescendantPlanCosts(sr: SubRow, planBySubRow: Map<string, PlanSideRow>): number {
  let sum = 0
  const walk = (row: SubRow) => {
    for (const ch of row.children ?? []) {
      const pr = planBySubRow.get(ch.id)
      sum += pr ? effectiveLeafCost(pr, ch) : 0
      walk(ch)
    }
  }
  walk(sr)
  return sum
}

/** For each BOQ line that has nested children: total ราคา/หน่วย from all descendant plan rows. */
function buildPlanCostRollupBySubRowId(groups: Group[], planBySubRow: Map<string, PlanSideRow>): Map<string, number> {
  const out = new Map<string, number>()
  const visit = (sr: SubRow) => {
    if ((sr.children?.length ?? 0) > 0) {
      out.set(sr.id, sumDescendantPlanCosts(sr, planBySubRow))
    }
    for (const c of sr.children ?? []) visit(c)
  }
  for (const g of groups) for (const sec of g.sections) for (const r of sec.subRows) visit(r)
  return out
}

function effectivePlanCostForRow(
  r: PlanSideRow,
  rollupBySubRowId: Map<string, number> | undefined,
  subRowById: Map<string, SubRow> | undefined,
): number {
  if (!subRowById || !r.linkedSubRowId) return Number(r.cost) || 0
  const sr = subRowById.get(r.linkedSubRowId)
  if (!sr) return Number(r.cost) || 0
  if ((sr.children?.length ?? 0) > 0) return rollupBySubRowId?.get(r.linkedSubRowId) ?? 0
  return effectiveLeafCost(r, sr)
}
/** BOQ money: จำนวนเงิน = จำนวน × ราคาต่อหน่วย; แถวรวม = วัสดุ + แรง (รวมลูกใน tree totals). */
const calcMat  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.materialPrice)||0)
const calcLab  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.laborPrice)||0)
/** แก้จำนวนเงินใน NumInput → ย้อนกลับเป็นราคาต่อหน่วย (เหมือน logic qty×unit แต่กลับหัว). */
function unitPriceFromLineAmount(amount: number | '', quantity: number | ''): number | '' {
  const q = Number(quantity) || 0
  if (!q) return ''
  if (amount === '') return ''
  return Number(amount) / q
}
/** Full row money total (always mat + labor — column visibility does not change amounts). */
const calcRowMoneyTotal = (sr: SubRow) => calcMat(sr) + calcLab(sr)
const calcRowTotal = (sr: SubRow, mat = true) => (mat ? calcMat(sr) : 0) + calcLab(sr)
/** This row plus all nested descendants */
const calcRowTreeTotal = (sr: SubRow, mat = true): number =>
  calcRowTotal(sr, mat) + (sr.children ?? []).reduce((s, c) => s + calcRowTreeTotal(c, mat), 0)
const calcGrpTotal = (g: Group, mat = true) =>
  g.sections.flatMap(s => s.subRows).reduce((s, r) => s + calcRowTreeTotal(r, mat), 0)
/** Group total for display (always includes material + labor). */
const calcGrpMoneyTotal = (g: Group) => calcGrpTotal(g, true)
/** Section total — mat + labor across all nested rows. */
const calcSecMoneyTotal = (s: Section) => s.subRows.reduce((sum, r) => sum + calcRowTreeTotal(r, true), 0)
/** Section total in actual-compare mode (applies workDecrease/workIncrease adjustments). */
const calcSecAdjustedMoneyTotal = (s: Section) => s.subRows.reduce((sum, r) => sum + calcRowTreeAdjusted(r), 0)

function normalizeSubRow(r: SubRow & { children?: SubRow[] }): SubRow {
  const kids = Array.isArray(r.children) ? r.children.map(normalizeSubRow) : []
  return {
    ...r,
    width: r.width ?? '',
    length: r.length ?? '',
    workDecrease: r.workDecrease ?? '',
    workIncrease: r.workIncrease ?? '',
    children: kids,
  }
}

/** Actual: รวมหลังปรับ = ค่าวัสดุ+แรงจริงของแถว − งานลด + งานเพิ่ม (คอลัมน์แผน(รวม) ยังเปรียบเทียบกับแผนแยก). */
function calcAdjustedLineTotal(sr: SubRow): number {
  const base = calcRowMoneyTotal(sr)
  const dec = Number(sr.workDecrease) || 0
  const inc = Number(sr.workIncrease) || 0
  return base - dec + inc
}

function calcRowTreeAdjusted(sr: SubRow): number {
  const here = calcAdjustedLineTotal(sr)
  return here + (sr.children ?? []).reduce((s, c) => s + calcRowTreeAdjusted(c), 0)
}

function calcGrpAdjustedMoneyTotal(g: Group): number {
  return g.sections.flatMap(s => s.subRows).reduce((s, r) => s + calcRowTreeAdjusted(r), 0)
}

/** Sum of plan-line money (or actual if no plan row) — matches แผน (รวม) column. */
function calcRowTreePlanBase(sr: SubRow, planMap: Map<string, SubRow>): number {
  const pr = planMap.get(sr.id)
  const base = pr ? calcRowMoneyTotal(pr) : calcRowMoneyTotal(sr)
  return base + (sr.children ?? []).reduce((s, c) => s + calcRowTreePlanBase(c, planMap), 0)
}

function calcGrpPlanBaseMoneyTotal(g: Group, planMap: Map<string, SubRow>): number {
  return g.sections.flatMap(s => s.subRows).reduce((s, r) => s + calcRowTreePlanBase(r, planMap), 0)
}

function sumWorkAdjustmentsForGroup(g: Group): { dec: number; inc: number } {
  let dec = 0
  let inc = 0
  const walk = (rows: SubRow[]) => {
    for (const r of rows) {
      dec += Number(r.workDecrease) || 0
      inc += Number(r.workIncrease) || 0
      walk(r.children ?? [])
    }
  }
  for (const s of g.sections) walk(s.subRows)
  return { dec, inc }
}

function buildPlanRowMap(groups: Group[]): Map<string, SubRow> {
  const m = new Map<string, SubRow>()
  const walk = (rows: SubRow[]) => {
    for (const r of rows) {
      m.set(r.id, r)
      walk(r.children ?? [])
    }
  }
  for (const g of groups) {
    for (const s of g.sections) walk(s.subRows)
  }
  return m
}

function updateSubRowField(rows: SubRow[], rid: string, field: keyof SubRow, val: string | number): SubRow[] {
  return rows.map(r => {
    if (r.id === rid) return { ...r, [field]: val } as SubRow
    return { ...r, children: updateSubRowField(r.children ?? [], rid, field, val) }
  })
}

function updateSubRowFields(rows: SubRow[], rid: string, patch: Partial<SubRow>): SubRow[] {
  return rows.map(r => {
    if (r.id === rid) return { ...r, ...patch } as SubRow
    return { ...r, children: updateSubRowFields(r.children ?? [], rid, patch) }
  })
}

/** Remove row by id; at section root, keep at least one empty line */
function deleteSubRowById(rows: SubRow[], rid: string, atSectionRoot: boolean): SubRow[] {
  const idx = rows.findIndex(r => r.id === rid)
  if (idx >= 0) {
    const next = rows.filter((_, i) => i !== idx)
    if (atSectionRoot && next.length === 0) return [emptySubRow()]
    return next
  }
  return rows.map(r => ({ ...r, children: deleteSubRowById(r.children ?? [], rid, false) }))
}

function addChildSubRow(rows: SubRow[], parentId: string, row: SubRow): SubRow[] {
  return rows.map(r => {
    if (r.id === parentId) return { ...r, children: [...(r.children ?? []), row] }
    return { ...r, children: addChildSubRow(r.children ?? [], parentId, row) }
  })
}
const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Split `total` across buckets by weight; uses satang so parts sum to `total` (2 dp). */
function distributeProportionalAmounts(weights: number[], total: number): number[] {
  if (!weights.length) return []
  const sumW = weights.reduce((a, b) => a + b, 0)
  if (sumW <= 0 || total <= 0) return weights.map(() => 0)
  const cents = Math.round(total * 100)
  const raw = weights.map(w => (w / sumW) * cents)
  const floors = raw.map(r => Math.floor(r))
  let assigned = floors.reduce((a, b) => a + b, 0)
  let remainder = cents - assigned
  const order = raw
    .map((r, i) => ({ i, frac: r - floors[i] }))
    .sort((a, b) => b.frac - a.frac)
  const out = [...floors]
  for (let k = 0; k < remainder; k++) {
    out[order[k % order.length].i] += 1
  }
  return out.map(c => c / 100)
}

/* ── Default column widths — baseline saved in ../DEFAULTS.md (2026-04-04) ── */
const DEFAULT_WIDTHS = { no: 60, refPage: 60, refCode: 60, width: 64, length: 64, desc: 380, qty: 64, unit: 48, matPrice: 110, matAmt: 115, laborPrice: 110, laborAmt: 115, total: 120, action: 100, note: 140, secPct: 70, secDiscount: 120, secNet: 130 }
type ColKey = keyof typeof DEFAULT_WIDTHS

const DEFAULT_SIDE_WIDTHS = { ref: 100, lead: 80, sub: 220, docIssue: 120, docTitle: 140, pricePerUnit: 110, cost: 110, gpPct: 80, gpAmt: 110, sell: 120 }
type SideColKey = keyof typeof DEFAULT_SIDE_WIDTHS

/** Column visibility (กรอง). ราคาวัสดุ (4) ปิด → หัวคอลัมน์แรงแสดง ค่าวัสดุและแรงงาน แทน ค่าแรงงาน */
type BoqColVis = {
  showRefId: boolean
  showDesc: boolean
  showQtyUnit: boolean
  showMaterial: boolean
  /** When material is on but user hid detail cols — one narrow “+” column */
  materialCollapsed?: boolean
  showLabor: boolean
  showTotal: boolean
  showNote: boolean
}

const BOQ_COL_VIS_DEFAULT: BoqColVis = {
  showRefId: true,
  showDesc: true,
  showQtyUnit: true,
  showMaterial: true,
  materialCollapsed: false,
  showLabor: true,
  showTotal: true,
  showNote: true,
}

function boqColVisFilterActive(v: BoqColVis) {
  return (Object.keys(BOQ_COL_VIS_DEFAULT) as (keyof BoqColVis)[]).some(k => v[k] !== BOQ_COL_VIS_DEFAULT[k])
}

function boqMaterialColCount(vis: BoqColVis): number {
  if (!vis.showMaterial) return 0
  return vis.materialCollapsed ? 1 : 2
}

function boqMatLabColCount(vis: BoqColVis): number {
  return boqMaterialColCount(vis) + (vis.showLabor ? 2 : 0)
}

function materialTailSlots(vis: BoqColVis): 0 | 1 | 2 {
  if (!vis.showMaterial) return 0
  return vis.materialCollapsed ? 1 : 2
}

/** Colspan for group/section title when รายการ is hidden (covers กว้าง+ยาว + next visible data columns). */
function boqLeadTitleColSpan(vis: BoqColVis): number {
  if (vis.showDesc) return 1
  // กว้าง+ยาว are always present — absorb them into the title span when desc is hidden
  if (vis.showQtyUnit) return 2 + 2
  const ml = boqMatLabColCount(vis)
  if (ml > 0) return ml + 2
  let n = 2 // กว้าง + ยาว
  if (vis.showTotal) n += 1
  if (vis.showNote) n += 1
  return Math.max(1, n)
}

/** Empty cells after the title column(s) — avoids double-counting when title colspan already covers qty/mat+lab/total+note. */
function boqTailAfterTitle(vis: BoqColVis): { qty2: boolean; matSlots: 0 | 1 | 2; lab2: boolean; tot: boolean; note: boolean } {
  if (vis.showDesc) {
    return {
      qty2: vis.showQtyUnit,
      matSlots: materialTailSlots(vis),
      lab2: vis.showLabor,
      tot: vis.showTotal,
      note: vis.showNote,
    }
  }
  if (vis.showQtyUnit) {
    return {
      qty2: false,
      matSlots: materialTailSlots(vis),
      lab2: vis.showLabor,
      tot: vis.showTotal,
      note: vis.showNote,
    }
  }
  if (boqMatLabColCount(vis) > 0) {
    return { qty2: false, matSlots: 0, lab2: false, tot: vis.showTotal, note: vis.showNote }
  }
  return { qty2: false, matSlots: 0, lab2: false, tot: false, note: false }
}

/** Column count for summary tail from qty through รวม (excludes รายการ, หมายเหตุ, action). */
function boqSummaryTailColumnCount(vis: BoqColVis, actualMoneyTail4: boolean): number {
  const tail = boqTailAfterTitle(vis)
  let n = 0
  if (tail.qty2) n += 2
  n += tail.matSlots
  if (tail.lab2) n += 2
  if (tail.tot) n += actualMoneyTail4 ? 4 : 1
  return n
}

/** Colspan: รายการ + กว้าง + ยาว + tail through รวม — wide cell for per-group discount strip. */
function boqGroupDiscountWideColSpan(vis: BoqColVis, actualMoneyTail4: boolean): number {
  if (!vis.showDesc) return 0
  return 1 + 2 + boqSummaryTailColumnCount(vis, actualMoneyTail4)
}

/* ── NumInput ─────────────────────────────────────────── */
function NumInput({ value, onChange, className = '', readOnly = false, title, blankZero = false }: { value: number|''; onChange:(v:number|'')=>void; className?:string; readOnly?:boolean; title?: string; blankZero?: boolean }) {
  const [loc, setLoc] = useState<string|null>(null)
  const display = loc !== null ? loc : (value==='' ? '' : (blankZero && Number(value) === 0 ? '' : fmt(value as number)))
  return (
    <input className={className} type="text" inputMode="decimal" value={display} readOnly={readOnly} title={title}
      onFocus={() => { if (!readOnly) setLoc(value==='' ? '' : String(value)) }}
      onBlur={e => { if (readOnly) return; const n=parseFloat(e.target.value.replace(/,/g,'')); onChange(isNaN(n)||e.target.value==='' ? '' : n); setLoc(null) }}
      onChange={e => { if (!readOnly) setLoc(e.target.value) }}
    />
  )
}

/* ── AutoTextarea — expands vertically as text grows ──── */
function AutoTextarea({ value, onChange, placeholder, readOnly, className }: { value:string; onChange:(v:string)=>void; placeholder?:string; readOnly?:boolean; className?:string }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = ref.current.scrollHeight + 'px' }
  }, [value])
  return (
    <textarea ref={ref} className={className} value={value} readOnly={readOnly} placeholder={placeholder} rows={1}
      style={{ resize: 'none', overflow: 'hidden', boxSizing: 'border-box' }}
      onChange={e => { onChange(e.target.value); if (ref.current) { ref.current.style.height='auto'; ref.current.style.height=ref.current.scrollHeight+'px' } }}
    />
  )
}

/* ── SummaryRow ───────────────────────────────────────── */
function SummaryRow({
  label, amount, highlight, editNode, vis, actualMoneyTail4 = false, actualFourCols, extraCells, discountCells,
}: {
  label: React.ReactNode
  amount: string
  highlight: boolean
  editNode?: React.ReactNode
  vis: BoqColVis
  actualMoneyTail4?: boolean
  /** When Actual vs plan: show แผน / งานลด / งานเพิ่ม / รวมหลังปรับ in the four total columns (group & grand rows). */
  actualFourCols?: { plan: string; dec: string; inc: string; adj: string }
  /** Extra cells appended at the end of the row (e.g. PLAN/ACTUAL panel cells in unified table). */
  extraCells?: React.ReactNode
  /** Per-section discount cells (ส่วนลดแต่ละข้อ + ยอดงานหลังส่วนลด) — inserted before action column. */
  discountCells?: React.ReactNode
}) {
  const hl = highlight ? ' boq-summary-label--highlight' : ''
  const rowCls = highlight ? 'boq-summary-row boq-summary-row--highlight' : 'boq-summary-row'
  const cellCls = highlight ? ' boq-summary-cell boq-summary-cell--highlight' : ' boq-summary-cell'
  const { showRefId, showDesc, showQtyUnit, showMaterial, showLabor, showTotal, showNote } = vis
  const amountBlock = editNode ?? amount
  const leadSpan = !showDesc ? boqLeadTitleColSpan(vis) : 1
  const tail = boqTailAfterTitle(vis)
  /** รายการ = ข้อความเท่านั้น; ยอดเงินไปคอลัมน์รวม/วัสดุ/แรง — ซ้อนใต้ข้อความเฉพาะเมื่อไม่มีคอลัมน์เงินให้วาง */
  const stackAmountInLabel = !showTotal && !tail.tot && tail.matSlots === 0 && !tail.lab2
  const amountInTotalCol = showTotal
  const amountInMatAmtCol = !showTotal && !showLabor && showMaterial && tail.matSlots === 2

  const labelContent = stackAmountInLabel ? (
    <span className="boq-summary-label-stack">
      <span className="boq-summary-label-text">{label}</span>
      <span className="boq-td-num boq-summary-amount boq-summary-inline-amt">{amountBlock}</span>
    </span>
  ) : label

  return (
    <tr className={rowCls}>
      <td className={`boq-td${cellCls}${hl}`}/>
      {showRefId && (<><td className={`boq-td${cellCls}${hl}`}/><td className={`boq-td${cellCls}${hl}`}/></>)}
      {!showDesc ? (
        <td colSpan={leadSpan} className={`boq-td boq-summary-label${cellCls}${hl}`}>
          {labelContent}
        </td>
      ) : (
        <td className={`boq-td boq-summary-label${cellCls}${hl}`}>
          {labelContent}
        </td>
      )}
      {showDesc && (<><td className={`boq-td${cellCls}${hl}`}/><td className={`boq-td${cellCls}${hl}`}/></>)}
      {tail.qty2 && (<><td className={`boq-td${cellCls}${hl}`}/><td className={`boq-td${cellCls}${hl}`}/></>)}
      {tail.matSlots === 2 && (
        <>
          <td className={`boq-td${cellCls}${hl}`}/>
          <td className={`boq-td boq-td-num${cellCls}${hl}${amountInMatAmtCol ? ' boq-summary-amount' : ''}`}>
            {amountInMatAmtCol ? amountBlock : ''}
          </td>
        </>
      )}
      {tail.matSlots === 1 && <td className={`boq-td${cellCls}${hl}`}/>}
      {tail.lab2 && (
        <>
          <td className={`boq-td${cellCls}${hl}`}/>
          <td className={`boq-td boq-td-num${cellCls}${hl} ${amountInTotalCol ? 'boq-summary-dash' : 'boq-summary-amount'}`}>
            {amountInTotalCol ? '-' : amountBlock}
          </td>
        </>
      )}
      {tail.tot && (
        actualMoneyTail4 ? (
          actualFourCols ? (
            <>
              <td className={`boq-td boq-td-num${cellCls}${hl}`}>{actualFourCols.plan}</td>
              <td className={`boq-td boq-td-num${cellCls}${hl}`}>{actualFourCols.dec}</td>
              <td className={`boq-td boq-td-num${cellCls}${hl}`}>{actualFourCols.inc}</td>
              <td className={`boq-td boq-td-num boq-summary-amount${cellCls}${hl}`}>{actualFourCols.adj}</td>
            </>
          ) : (
            <>
              <td className={`boq-td${cellCls}${hl}`} />
              <td className={`boq-td${cellCls}${hl}`} />
              <td className={`boq-td${cellCls}${hl}`} />
              <td className={`boq-td boq-td-num boq-summary-amount${cellCls}${hl}`}>
                {amountInTotalCol ? amountBlock : ''}
              </td>
            </>
          )
        ) : (
          <td className={`boq-td boq-td-num boq-summary-amount${cellCls}${hl}`}>
            {amountInTotalCol ? amountBlock : ''}
          </td>
        )
      )}
      {/* action | หมายเหตุ | discount cols */}
      <td className={`boq-td boq-td-action${cellCls}${hl}`}/>
      {tail.note && <td className={`boq-td${cellCls}${hl}`}/>}
      {discountCells}
      {extraCells}
    </tr>
  )
}

type PlanSideFooterAgg = { sumList: number; sumCost: number; sumGp: number; sumSell: number; avgGpPct: number }

function aggregatePlanSideFooter(
  rows: PlanSideRow[],
  opts?: { rollupBySubRowId: Map<string, number>; subRowById: Map<string, SubRow> },
): PlanSideFooterAgg {
  let sumList = 0
  let sumCost = 0
  let sumGp = 0
  let sumSell = 0
  let weightedGp = 0
  for (const r of rows) {
    const c = effectivePlanCostForRow(r, opts?.rollupBySubRowId, opts?.subRowById)
    const gpp = Number(r.gpPct) || 0
    const { gpAmount, sellPrice } = planSideRowDerived(r, c)
    sumList += Number(r.listPrice) || 0
    sumCost += c
    sumGp += gpAmount
    sumSell += sellPrice
    weightedGp += c * gpp
  }
  const avgGpPct = sumCost > 0 ? weightedGp / sumCost : 0
  return { sumList, sumCost, sumGp, sumSell, avgGpPct }
}

/** One Plan/Actual body row aligned to main BOQ (group / section / summary / line). */
type BoqTriplexSlot =
  | { kind: 'group'; key: string }
  | { kind: 'section'; key: string }
  | { kind: 'subrow'; subRowId: string; depth: number; key: string }
  | { kind: 'groupSummary'; key: string; subRowIds: string[] }
  | { kind: 'sectionDiscount'; key: string }
  | { kind: 'groupDiscount'; key: string }

function buildBoqTriplexBodySlots(
  groups: Group[],
  showDesc: boolean,
  tableShowTotal: boolean,
  showSecDiscount: boolean,
): BoqTriplexSlot[] {
  const walkLines = (rows: SubRow[], depth: number, slots: BoqTriplexSlot[]) => {
    for (const sr of rows) {
      slots.push({ kind: 'subrow', subRowId: sr.id, depth, key: `l-${sr.id}` })
      walkLines(sr.children ?? [], depth + 1, slots)
    }
  }
  if (!showDesc) {
    const slots: BoqTriplexSlot[] = []
    for (const g of groups) {
      for (const sec of g.sections) walkLines(sec.subRows, 0, slots)
    }
    return slots
  }
  const slots: BoqTriplexSlot[] = []
  for (const g of groups) {
    slots.push({ kind: 'group', key: `g-${g.id}` })
    for (const sec of g.sections) {
      slots.push({ kind: 'section', key: `s-${sec.id}` })
      walkLines(sec.subRows, 0, slots)
      if (tableShowTotal && showSecDiscount) slots.push({ kind: 'sectionDiscount', key: `sd-${sec.id}` })
    }
    const subRowIds = g.sections.flatMap(sec => sec.subRows.map(sr => sr.id))
    slots.push({ kind: 'groupSummary', key: `gs-${g.id}`, subRowIds })
  }
  return slots
}

function planRowsBySubRowWithOrphans(rows: PlanSideRow[]): { bySubRow: Map<string, PlanSideRow>; orphans: PlanSideRow[] } {
  const bySubRow = new Map<string, PlanSideRow>()
  const orphans: PlanSideRow[] = []
  for (const r of rows) {
    const lid = r.linkedSubRowId
    if (!lid) {
      orphans.push(r)
      continue
    }
    if (!bySubRow.has(lid)) bySubRow.set(lid, r)
    else orphans.push(r)
  }
  return { bySubRow, orphans }
}

function PlanSidePricingDataRow({
  r,
  trClassName,
  ro,
  interactive,
  boqRefLinkLocked,
  rolledUpPlanCost,
  linkedSubRowQuantity,
  displayNoBySubRowId,
  linkOptions,
  onUpdateRow,
  onDeleteRow,
  syncedListPrice,
  syncedSub,
}: {
  r: PlanSideRow
  trClassName?: string
  ro: boolean
  interactive: boolean
  /** Triplex: row is tied to one BOQ line — show ref as text only (no link `<select>`). */
  boqRefLinkLocked?: boolean
  /** Parent BOQ line: ราคา/หน่วย = sum of descendant plan rows' `cost` (read-only). */
  rolledUpPlanCost?: number
  /** BOQ quantity for the linked SubRow — used to compute ราคาทุน = pricePerUnit x quantity. */
  linkedSubRowQuantity?: number
  displayNoBySubRowId: Record<string, string>
  linkOptions: { subRowId: string; displayNo: string }[]
  onUpdateRow: (rowId: string, field: keyof PlanSideRow, val: string | number | '') => void
  onDeleteRow?: (rowId: string) => void
  /** Live BOQ หลังส่วนลด — overrides stored listPrice for display */
  syncedListPrice?: number
  /** Live BOQ รายการ (top-level rows only) — overrides stored sub for display */
  syncedSub?: string
}) {
  const useCostRollup = typeof rolledUpPlanCost === 'number'
  const derivedCost =
    !useCostRollup && linkedSubRowQuantity !== undefined
      ? (Number(r.pricePerUnit) || 0) * linkedSubRowQuantity
      : undefined
  const effectiveCost = useCostRollup ? rolledUpPlanCost : derivedCost !== undefined ? derivedCost : Number(r.cost) || 0
  const { gpAmount, sellPrice } = planSideRowDerived(r, effectiveCost)
  const linkedDisp = r.linkedSubRowId ? displayNoBySubRowId[r.linkedSubRowId] ?? '' : ''
  const linkOrphan = Boolean(r.linkedSubRowId && !linkedDisp)
  const pctDisp =
    ro && r.gpPct === ''
      ? ''
      : `${(Number(r.gpPct) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  const locked = Boolean(boqRefLinkLocked)
  const showSelectForBoqRef = interactive && !locked && !isTriplexPendingPlanRowId(r.id)
  const showStaticBoqRefLabel = !showSelectForBoqRef
  return (
    <tr className={trClassName ?? 'boq-row'}>
      <td className="boq-td boq-td-no boq-td-sub-no boq-side-td boq-side-td--boq-ref">
        <div className="boq-side-boq-ref-cell boq-side-boq-ref-cell--compact">
          {showStaticBoqRefLabel && linkedDisp ? (
            <span className="boq-side-boq-ref-no">{linkedDisp}</span>
          ) : showStaticBoqRefLabel && r.linkedSubRowId ? (
            <span className="boq-side-boq-ref-orphan" title={r.linkedSubRowId}>
              ไม่พบ
            </span>
          ) : null}
          {showSelectForBoqRef && (
            <select
              className="boq-input boq-side-boq-ref-select"
              aria-label="ผูกบรรทัด BOQ"
              value={r.linkedSubRowId}
              onChange={e => onUpdateRow(r.id, 'linkedSubRowId', e.target.value)}
            >
              <option value="">— เลือก —</option>
              {linkOrphan && <option value={r.linkedSubRowId}>บรรทัดเดิม (ไม่พบใน BOQ)</option>}
              {linkOptions.map(o => (
                <option key={o.subRowId} value={o.subRowId}>
                  {o.displayNo}
                </option>
              ))}
            </select>
          )}
        </div>
      </td>
      <td className="boq-td boq-td-num boq-td-sub-no boq-side-td">
        {syncedListPrice !== undefined
          ? fmt(syncedListPrice)
          : ro ? (
            r.listPrice === '' ? null : fmt(Number(r.listPrice))
          ) : (
            <NumInput
              className="boq-input boq-input-num"
              value={r.listPrice}
              readOnly={false}
              onChange={v => onUpdateRow(r.id, 'listPrice', v)}
            />
          )}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text">
        {syncedSub !== undefined
          ? (syncedSub || null)
          : ro ? (
            r.sub || null
          ) : (
            <input type="text" className="boq-input" value={r.sub} onChange={e => onUpdateRow(r.id, 'sub', e.target.value)} />
          )}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-issue">
        {ro ? (
          r.docIssue || null
        ) : (
          <input
            type="text"
            className="boq-input boq-side-doc-field"
            value={r.docIssue}
            aria-label="เลขที่"
            onChange={e => onUpdateRow(r.id, 'docIssue', e.target.value)}
          />
        )}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-title">
        {ro ? (
          r.docTitle || null
        ) : (
          <input
            type="text"
            className="boq-input boq-side-doc-field"
            value={r.docTitle}
            aria-label="เอกสาร"
            onChange={e => onUpdateRow(r.id, 'docTitle', e.target.value)}
          />
        )}
      </td>
      <td className="boq-td boq-td-num boq-side-td">
        {ro ? (
          r.pricePerUnit === '' ? null : fmt(Number(r.pricePerUnit))
        ) : (
          <NumInput
            className="boq-input boq-input-num"
            value={r.pricePerUnit}
            readOnly={false}
            onChange={v => onUpdateRow(r.id, 'pricePerUnit', v)}
          />
        )}
      </td>
      <td className="boq-td boq-td-num boq-side-td">
        {useCostRollup ? (
          <span className="boq-side-td--rollup-cost" title="รวมจากบรรทัดลูกใน BOQ">
            {fmt(rolledUpPlanCost)}
          </span>
        ) : derivedCost !== undefined ? (
          <span className="boq-side-td--rollup-cost" title="ราคา/หน่วย x จำนวน BOQ">
            {fmt(derivedCost)}
          </span>
        ) : ro ? (
          r.cost === '' ? null : fmt(Number(r.cost))
        ) : (
          <NumInput
            className="boq-input boq-input-num"
            value={r.cost}
            readOnly={false}
            onChange={v => onUpdateRow(r.id, 'cost', v)}
          />
        )}
      </td>
      <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell">
        {ro ? (
          pctDisp
        ) : (
          <span className="boq-side-pct-wrap">
            <NumInput
              className="boq-input boq-input-num boq-input-num--pct"
              value={r.gpPct}
              readOnly={false}
              onChange={v => onUpdateRow(r.id, 'gpPct', v)}
            />
            <span className="boq-side-pct-suffix">%</span>
          </span>
        )}
      </td>
      <td className="boq-td boq-td-num boq-td-calc boq-side-td">{fmt(gpAmount)}</td>
      <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell">
        <div className="boq-side-last-cell-inner">
          <span className="boq-side-last-val">{fmt(sellPrice)}</span>
          {interactive && onDeleteRow && !isTriplexPendingPlanRowId(r.id) && (
            <button type="button" className="boq-side-row-del" title="ลบแถว" onClick={() => onDeleteRow(r.id)}>
              ×
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

/** The 10 PLAN/Actual <td> cells for one unified-table row (no <tr> wrapper). */
function PlanSideDataCells({
  r, ro, interactive, boqRefLinkLocked, rolledUpPlanCost, linkedSubRowQuantity,
  displayNoBySubRowId, linkOptions, onUpdateRow, onDeleteRow, panelStart,
  syncedListPrice, syncedSub,
}: {
  r: PlanSideRow; ro: boolean; interactive: boolean; boqRefLinkLocked?: boolean
  rolledUpPlanCost?: number; linkedSubRowQuantity?: number; panelStart?: boolean
  displayNoBySubRowId: Record<string, string>; linkOptions: { subRowId: string; displayNo: string }[]
  onUpdateRow: (rowId: string, field: keyof PlanSideRow, val: string | number | '') => void
  onDeleteRow?: (rowId: string) => void
  /** Live-synced from BOQ: overrides stored listPrice / sub as read-only display. */
  syncedListPrice?: number
  syncedSub?: string
}) {
  const useCostRollup = typeof rolledUpPlanCost === 'number'
  const derivedCost = !useCostRollup && linkedSubRowQuantity !== undefined
    ? (Number(r.pricePerUnit) || 0) * linkedSubRowQuantity : undefined
  const effectiveCost = useCostRollup ? rolledUpPlanCost
    : derivedCost !== undefined ? derivedCost : Number(r.cost) || 0
  const { gpAmount, sellPrice } = planSideRowDerived(r, effectiveCost)
  const linkedDisp = r.linkedSubRowId ? displayNoBySubRowId[r.linkedSubRowId] ?? '' : ''
  const linkOrphan = Boolean(r.linkedSubRowId && !linkedDisp)
  const pctDisp = ro && r.gpPct === '' ? ''
    : `${(Number(r.gpPct) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  const locked = Boolean(boqRefLinkLocked)
  const showSelectForBoqRef = interactive && !locked && !isTriplexPendingPlanRowId(r.id)
  const showStaticBoqRefLabel = !showSelectForBoqRef
  const ps = panelStart ? ' boq-side-td--panel-start' : ''
  return (
    <>
      <td className={`boq-td boq-td-no boq-td-sub-no boq-side-td boq-side-td--boq-ref${ps}`}>
        <div className="boq-side-boq-ref-cell boq-side-boq-ref-cell--compact">
          {showStaticBoqRefLabel && linkedDisp
            ? <span className="boq-side-boq-ref-no">{linkedDisp}</span>
            : showStaticBoqRefLabel && r.linkedSubRowId
            ? <span className="boq-side-boq-ref-orphan" title={r.linkedSubRowId}>ไม่พบ</span>
            : null}
          {showSelectForBoqRef && (
            <select className="boq-input boq-side-boq-ref-select" aria-label="ผูกบรรทัด BOQ"
              value={r.linkedSubRowId} onChange={e => onUpdateRow(r.id, 'linkedSubRowId', e.target.value)}>
              <option value="">— เลือก —</option>
              {linkOrphan && <option value={r.linkedSubRowId}>บรรทัดเดิม (ไม่พบใน BOQ)</option>}
              {linkOptions.map(o => <option key={o.subRowId} value={o.subRowId}>{o.displayNo}</option>)}
            </select>
          )}
        </div>
      </td>
      <td className="boq-td boq-td-num boq-td-sub-no boq-side-td ppc-lp">
        {syncedListPrice !== undefined
          ? fmt(syncedListPrice)
          : ro ? (r.listPrice === '' ? null : fmt(Number(r.listPrice)))
          : <NumInput className="boq-input boq-input-num" value={r.listPrice} readOnly={false} onChange={v => onUpdateRow(r.id, 'listPrice', v)} />}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text ppc-sub">
        {syncedSub !== undefined
          ? (syncedSub || null)
          : ro ? (r.sub || null) : <input type="text" className="boq-input" value={r.sub} onChange={e => onUpdateRow(r.id, 'sub', e.target.value)} />}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-issue ppc-di">
        {ro ? (r.docIssue || null) : <input type="text" className="boq-input boq-side-doc-field" value={r.docIssue} aria-label="เลขที่" onChange={e => onUpdateRow(r.id, 'docIssue', e.target.value)} />}
      </td>
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-title ppc-dt">
        {ro ? (r.docTitle || null) : <input type="text" className="boq-input boq-side-doc-field" value={r.docTitle} aria-label="เอกสาร" onChange={e => onUpdateRow(r.id, 'docTitle', e.target.value)} />}
      </td>
      <td className="boq-td boq-td-num boq-side-td ppc-ppu">
        {ro ? (r.pricePerUnit === '' ? null : fmt(Number(r.pricePerUnit)))
          : <NumInput className="boq-input boq-input-num" value={r.pricePerUnit} readOnly={false} onChange={v => onUpdateRow(r.id, 'pricePerUnit', v)} />}
      </td>
      <td className="boq-td boq-td-num boq-side-td ppc-cost">
        {useCostRollup
          ? <span className="boq-side-td--rollup-cost" title="รวมจากบรรทัดลูกใน BOQ">{fmt(rolledUpPlanCost)}</span>
          : derivedCost !== undefined
          ? <span className="boq-side-td--rollup-cost" title="ราคา/หน่วย x จำนวน BOQ">{fmt(derivedCost)}</span>
          : ro ? (r.cost === '' ? null : fmt(Number(r.cost)))
          : <NumInput className="boq-input boq-input-num" value={r.cost} readOnly={false} onChange={v => onUpdateRow(r.id, 'cost', v)} />}
      </td>
      <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell ppc-gppct">
        {ro ? pctDisp : (
          <span className="boq-side-pct-wrap">
            <NumInput className="boq-input boq-input-num boq-input-num--pct" value={r.gpPct} readOnly={false} onChange={v => onUpdateRow(r.id, 'gpPct', v)} />
            <span className="boq-side-pct-suffix">%</span>
          </span>
        )}
      </td>
      <td className="boq-td boq-td-num boq-td-calc boq-side-td ppc-gpamt">{fmt(gpAmount)}</td>
      <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell">
        <div className="boq-side-last-cell-inner">
          <span className="boq-side-last-val">{fmt(sellPrice)}</span>
          {interactive && onDeleteRow && !isTriplexPendingPlanRowId(r.id) && (
            <button type="button" className="boq-side-row-del" title="ลบแถว" onClick={() => onDeleteRow(r.id)}>×</button>
          )}
        </div>
      </td>
    </>
  )
}

/** 10 empty PLAN/ACTUAL cells for non-data rows (group/section headers, discount ghosts). */
function PlanEmptyCells({ panelStart }: { panelStart?: boolean }) {
  const ps = panelStart ? ' boq-side-td--panel-start' : ''
  return (
    <>
      <td className={`boq-td boq-td-no boq-td-sub-no boq-side-td boq-side-td--boq-ref${ps}`} />
      <td className="boq-td boq-td-num boq-td-sub-no boq-side-td ppc-lp" />
      <td className="boq-td boq-side-td boq-side-td--text ppc-sub" />
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-issue ppc-di" />
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-title ppc-dt" />
      <td className="boq-td boq-td-num boq-side-td ppc-ppu" />
      <td className="boq-td boq-td-num boq-side-td ppc-cost" />
      <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell ppc-gppct" />
      <td className="boq-td boq-td-num boq-td-calc boq-side-td ppc-gpamt" />
      <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell" />
    </>
  )
}

/** Shared PLAN / Actual pricing grid (read-only mirror or editable). */
function PlanSidePricingTable({
  boqMainHeadSubRow,
  bandLabel,
  rows,
  footer,
  displayNoBySubRowId,
  linkOptions,
  interactive,
  onUpdateRow,
  onDeleteRow,
  emptyMessage,
  planCostRollupBySubRowId,
  subRowById,
  triplex,
}: {
  boqMainHeadSubRow: boolean
  bandLabel: string
  rows: PlanSideRow[]
  footer: PlanSideFooterAgg
  displayNoBySubRowId: Record<string, string>
  linkOptions: { subRowId: string; displayNo: string }[]
  interactive: boolean
  onUpdateRow: (rowId: string, field: keyof PlanSideRow, val: string | number | '') => void
  onDeleteRow?: (rowId: string) => void
  emptyMessage: string
  /** Parent lines: sum of descendant plan `cost` for ราคา/หน่วย display. */
  planCostRollupBySubRowId?: Map<string, number>
  /** BOQ SubRow lookup — used to derive ราคาทุน = ราคา/หน่วย x BOQ quantity. */
  subRowById?: Map<string, SubRow>
  triplex?: {
    tbodyRef: React.RefObject<HTMLTableSectionElement | null>
    slots: BoqTriplexSlot[]
    bySubRow: Map<string, PlanSideRow>
    orphans: PlanSideRow[]
    onEnsureRowForSubRow?: (subRowId: string) => void
  }
}) {
  const ro = !interactive
  const getLinkedQty = (subRowId: string): number | undefined => {
    if (!subRowId || !subRowById) return undefined
    const sr = subRowById.get(subRowId)
    if (!sr || sr.quantity === '') return undefined
    return Number(sr.quantity)
  }
  const dashRow = (
    <>
      <td className="boq-td boq-td-num boq-td-sub-no boq-side-td" />
      <td className="boq-td boq-side-td boq-side-td--text" />
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-issue" />
      <td className="boq-td boq-side-td boq-side-td--text boq-side-td--doc-title" />
      <td className="boq-td boq-td-num boq-side-td" />
      <td className="boq-td boq-td-num boq-side-td" />
      <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell" />
      <td className="boq-td boq-td-num boq-td-calc boq-side-td" />
      <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell" />
    </>
  )
  const renderBody = () => {
    if (triplex) {
      const { slots, bySubRow, orphans, onEnsureRowForSubRow } = triplex
      const lines: React.ReactNode[] = []
      for (const s of slots) {
        if (s.kind === 'group') {
          lines.push(
            <tr key={s.key} className="boq-row boq-group-header-row boq-side-triplex-ghost" aria-hidden>
              <td colSpan={10} className="boq-td boq-side-triplex-ghost-cell boq-side-triplex-ghost-cell--group" />
            </tr>,
          )
          continue
        }
        if (s.kind === 'section') {
          lines.push(
            <tr key={s.key} className="boq-row boq-section-header-row boq-side-triplex-ghost" aria-hidden>
              <td colSpan={10} className="boq-td boq-side-triplex-ghost-cell boq-side-triplex-ghost-cell--section" />
            </tr>,
          )
          continue
        }
        if (s.kind === 'groupSummary') {
          let sumCost = 0, sumGp = 0, sumSell = 0, weightedGp = 0
          for (const sid of s.subRowIds) {
            const pr = bySubRow.get(sid)
            if (!pr) continue
            const c = effectivePlanCostForRow(pr, planCostRollupBySubRowId, subRowById)
            const gpp = Number(pr.gpPct) || 0
            const { gpAmount, sellPrice } = planSideRowDerived(pr, c)
            sumCost += c
            sumGp += gpAmount
            sumSell += sellPrice
            weightedGp += c * gpp
          }
          const avgGpPct = sumCost > 0 ? weightedGp / sumCost : 0
          lines.push(
            <tr key={s.key} className="boq-row boq-summary-row boq-side-summary-row">
              <td className="boq-td boq-td-no boq-side-td boq-side-td--boq-ref" />
              <td className="boq-td boq-td-num boq-side-td" />
              <td className="boq-td boq-side-td" colSpan={4} />
              <td className="boq-td boq-td-num boq-side-td">{fmt(sumCost)}</td>
              <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell boq-side-td--gp-avg">
                {sumCost > 0 ? `${avgGpPct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : ''}
              </td>
              <td className="boq-td boq-td-num boq-td-calc boq-side-td">{fmt(sumGp)}</td>
              <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell">{fmt(sumSell)}</td>
            </tr>,
          )
          continue
        }
        if (s.kind === 'sectionDiscount') {
          lines.push(
            <tr key={s.key} className="boq-row boq-summary-row boq-summary-row--section-discount boq-side-triplex-ghost" aria-hidden>
              <td colSpan={10} className="boq-td boq-side-triplex-ghost-cell boq-side-triplex-ghost-cell--discount" />
            </tr>,
          )
          continue
        }
        if (s.kind === 'groupDiscount') {
          lines.push(
            <tr key={s.key} className="boq-row boq-summary-row boq-summary-row--group-discount boq-side-triplex-ghost" aria-hidden>
              <td colSpan={10} className="boq-td boq-side-triplex-ghost-cell boq-side-triplex-ghost-cell--discount" />
            </tr>,
          )
          continue
        }
        const pr = bySubRow.get(s.subRowId)
        const trCls = s.depth >= 1 ? 'boq-row boq-row--nested' : 'boq-row'
        if (pr) {
          lines.push(
            <PlanSidePricingDataRow
              key={s.key}
              trClassName={trCls}
              r={pr}
              ro={ro}
              interactive={interactive}
              boqRefLinkLocked
              rolledUpPlanCost={pr.linkedSubRowId ? planCostRollupBySubRowId?.get(pr.linkedSubRowId) : undefined}
              linkedSubRowQuantity={getLinkedQty(s.subRowId)}
              displayNoBySubRowId={displayNoBySubRowId}
              linkOptions={linkOptions}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
            />,
          )
          continue
        }
        if (interactive && onEnsureRowForSubRow) {
          lines.push(
            <PlanSidePricingDataRow
              key={s.key}
              trClassName={trCls}
              r={{
                ...emptyPlanSideRow(),
                id: triplexPendingPlanRowId(s.subRowId),
                linkedSubRowId: s.subRowId,
              }}
              ro={false}
              interactive={interactive}
              boqRefLinkLocked
              rolledUpPlanCost={planCostRollupBySubRowId?.get(s.subRowId)}
              linkedSubRowQuantity={getLinkedQty(s.subRowId)}
              displayNoBySubRowId={displayNoBySubRowId}
              linkOptions={linkOptions}
              onUpdateRow={onUpdateRow}
              onDeleteRow={onDeleteRow}
            />,
          )
          continue
        }
        const disp = displayNoBySubRowId[s.subRowId] ?? ''
        lines.push(
          <tr key={s.key} className={trCls}>
            <td className="boq-td boq-td-no boq-td-sub-no boq-side-td boq-side-td--boq-ref">
              <div className="boq-side-boq-ref-cell boq-side-boq-ref-cell--triplex-slot">
                {disp ? <span className="boq-side-boq-ref-no">{disp}</span> : null}
                {onEnsureRowForSubRow && (
                  <button
                    type="button"
                    className="boq-btn boq-side-triplex-add-line"
                    title="เพิ่มแถวในบรรทัด BOQ นี้"
                    onClick={() => onEnsureRowForSubRow(s.subRowId)}
                  >
                    +
                  </button>
                )}
              </div>
            </td>
            {dashRow}
          </tr>,
        )
      }
      for (const o of orphans) {
        lines.push(
          <PlanSidePricingDataRow
            key={`orphan-${o.id}`}
            r={o}
            ro={ro}
            interactive={interactive}
            rolledUpPlanCost={o.linkedSubRowId ? planCostRollupBySubRowId?.get(o.linkedSubRowId) : undefined}
            linkedSubRowQuantity={getLinkedQty(o.linkedSubRowId)}
            displayNoBySubRowId={displayNoBySubRowId}
            linkOptions={linkOptions}
            onUpdateRow={onUpdateRow}
            onDeleteRow={onDeleteRow}
          />,
        )
      }
      if (lines.length === 0) {
        return (
          <tr className="boq-row">
            <td className="boq-td boq-side-td boq-side-td--muted" colSpan={10}>
              {emptyMessage}
            </td>
          </tr>
        )
      }
      return lines
    }
    if (rows.length === 0) {
      return (
        <tr className="boq-row">
          <td className="boq-td boq-side-td boq-side-td--muted" colSpan={10}>
            {emptyMessage}
          </td>
        </tr>
      )
    }
    return rows.map(r => (
      <PlanSidePricingDataRow
        key={r.id}
        r={r}
        ro={ro}
        interactive={interactive}
        rolledUpPlanCost={r.linkedSubRowId ? planCostRollupBySubRowId?.get(r.linkedSubRowId) : undefined}
        linkedSubRowQuantity={getLinkedQty(r.linkedSubRowId)}
        displayNoBySubRowId={displayNoBySubRowId}
        linkOptions={linkOptions}
        onUpdateRow={onUpdateRow}
        onDeleteRow={onDeleteRow}
      />
    ))
  }
  return (
    <table className="boq-table boq-side-table">
      <colgroup>
        <col className="boq-side-col boq-side-col--boq-ref" />
        <col className="boq-side-col boq-side-col--lead" />
        <col className="boq-side-col boq-side-col--sub" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
        <col className="boq-side-col" />
      </colgroup>
      <thead
        className={
          boqMainHeadSubRow ? 'boq-side-thead--two-row boq-side-thead--doc-split' : 'boq-side-thead--doc-split-single'
        }
      >
        {boqMainHeadSubRow ? (
          <>
            <tr>
              <th colSpan={2} className="boq-th boq-side-th boq-side-th--plan-band" lang="en">
                <span className="boq-side-th-r1-label">{bandLabel}</span>
              </th>
              <th colSpan={5} className="boq-th boq-side-th boq-side-th--cost-group">
                <span className="boq-side-th-r1-label">ต้นทุน</span>
              </th>
              <th colSpan={3} className="boq-th boq-side-th boq-side-th--sell-group" title="ประเมินราคาขาย + กำไร">
                <span className="boq-side-th-r1-label">ประเมิน + กำไร</span>
              </th>
            </tr>
            <tr>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--boq-ref-head" title="ลำดับบรรทัด BOQ (เช่น 1.1.1)">
                ลำดับ BOQ
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead">
                ราคาขาย
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">
                Sub
              </th>
              <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main">
                เลขที่เอกสาร
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">
                ราคา/หน่วย
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">
                ราคาทุน
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">
                GP%
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">
                GP Amount
              </th>
              <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">
                ราคาขาย
              </th>
            </tr>
            <tr>
              <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf">เลขที่</th>
              <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf">เอกสาร</th>
            </tr>
          </>
        ) : (
          <tr>
            <th className="boq-th boq-side-th boq-side-th--boq-ref-head">ลำดับ BOQ</th>
            <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead">
              <span className="boq-side-th__kind" lang="en">{bandLabel}</span>
              <span className="boq-side-th__rowhead-label">ราคาขาย</span>
            </th>
            <th className="boq-th boq-side-th boq-side-th--cost-leaf" title="ต้นทุน">
              Sub
            </th>
            <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main-merged" title="เลขที่เอกสาร">
              <div className="boq-side-th-doc-merged-inner">
                <span className="boq-side-th-doc-merged-parent">เลขที่เอกสาร</span>
                <div className="boq-side-th-doc-merged-leaves" aria-hidden>
                  <span>เลขที่</span>
                  <span>เอกสาร</span>
                </div>
              </div>
            </th>
            <th className="boq-th boq-side-th boq-side-th--cost-leaf" title="ต้นทุน">
              ราคา/หน่วย
            </th>
            <th className="boq-th boq-side-th boq-side-th--cost-leaf" title="ต้นทุน">
              ราคาทุน
            </th>
            <th className="boq-th boq-side-th boq-side-th--sell-leaf" title="ประเมินราคาขาย + กำไร">
              GP%
            </th>
            <th className="boq-th boq-side-th boq-side-th--sell-leaf" title="ประเมินราคาขาย + กำไร">
              GP Amount
            </th>
            <th className="boq-th boq-side-th boq-side-th--sell-leaf" title="ประเมินราคาขาย + กำไร">
              ราคาขาย
            </th>
          </tr>
        )}
      </thead>
      <tbody ref={triplex?.tbodyRef}>{renderBody()}</tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="boq-summary-row boq-side-summary-row">
            <td className="boq-td boq-td-no boq-td-sub-no boq-side-td boq-side-td--boq-ref" />
            <td className="boq-td boq-td-num boq-td-sub-no boq-side-td">{fmt(footer.sumList)}</td>
            <td className="boq-td boq-side-td boq-side-td--text" colSpan={4}>
              รวม
            </td>
            <td className="boq-td boq-td-num boq-side-td">{fmt(footer.sumCost)}</td>
            <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell boq-side-td--gp-avg">
              {footer.sumCost > 0
                ? `${footer.avgGpPct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                : ''}
            </td>
            <td className="boq-td boq-td-num boq-td-calc boq-side-td">{fmt(footer.sumGp)}</td>
            <td className="boq-td boq-td-num boq-td-total boq-side-td">{fmt(footer.sumSell)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  )
}

/* ── ConfirmModal ─────────────────────────────────────── */
function ConfirmModal({ message, onConfirm, onCancel }: { message:string; onConfirm:()=>void; onCancel:()=>void }) {
  return (
    <div className="boq-modal-overlay" onClick={onCancel}>
      <div className="boq-modal boq-confirm-modal" onClick={e => e.stopPropagation()}>
        <p className="boq-confirm-msg">{message}</p>
        <div className="boq-modal-actions">
          <button type="button" className="boq-modal-cancel" onClick={onCancel}>ยกเลิก</button>
          <button type="button" className="boq-confirm-ok" onClick={() => onConfirm()}>ยืนยัน</button>
        </div>
      </div>
    </div>
  )
}

/* ── Page ─────────────────────────────────────────────── */
export default function BoqEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useUser()
  const canEdit = canEditBoq(user?.email)
  const canDelete = canDeleteBoq(user?.email)
  const canSubmit = canSubmitBoq(user?.email)
  const canSign = canSignBoq(user?.email)

  const [jobName, setJobName]   = useState('')
  const [jobId, setJobId]       = useState('')
  const [boqTitle, setBoqTitle] = useState('')
  const [jobs, setJobs]         = useState<{ id: string; name: string }[]>([])
  const [boqExists, setBoqExists] = useState(false)
  const [groups, setGroups]     = useState<Group[]>([emptyGroup()])
  const [planSideRows, setPlanSideRows] = useState<PlanSideRow[]>(() => [emptyPlanSideRow(), emptyPlanSideRow()])
  /** Actual only: frozen copy of linked Plan's planSideRows (left strip). */
  const [planMirrorSideRows, setPlanMirrorSideRows] = useState<PlanSideRow[]>([])
  /** คอลัมน์ราคาวัสดุ — บันทึกเป็น showMaterial */
  const [showMat, setShowMat]   = useState(true)
  /** UI only: กรองเปิดวัสดุแล้ว — ซ่อน ราคาต่อหน่วย/จำนวนเงิน เหลือคอลัมน์แคบ + คลิกคืน */
  const [matDetailHidden, setMatDetailHidden] = useState(false)
  /** คอลัมน์ค่าแรงงาน (แยกจากวัสดุ; ไม่บันทึกใน API) */
  const [showLabor, setShowLabor] = useState(true)
  const [showRefId, setShowRefId] = useState(true)
  const [showDesc, setShowDesc] = useState(true)
  const [showQtyUnit, setShowQtyUnit] = useState(true)
  const [showTotal, setShowTotal] = useState(true)
  const [showNote, setShowNote] = useState(true)
  const [showSecDiscount, setShowSecDiscount] = useState(true)
  const [overheadPct, setOverheadPct]         = useState(12)
  const [vatPct, setVatPct]                   = useState(7)
  const [discount, setDiscount]               = useState<number|''>(0)
  const [discountType, setDiscountType]       = useState<'pct'|'amount'>('amount')
  const [boqKind, setBoqKind] = useState<'PLAN'|'ACTUAL'>('PLAN')
  const [planGroups, setPlanGroups] = useState<Group[]>([])
  const [planRefLabel, setPlanRefLabel] = useState<string | null>(null)
  const [boqStatus, setBoqStatus] = useState<'DRAFT'|'PENDING'|'APPROVED'>('DRAFT')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [signing, setSigning]   = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [saveError, setSaveError] = useState<string|null>(null)
  const [confirm, setConfirm]   = useState<{ msg: string; fn: () => void }|null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [planFilterOpen, setPlanFilterOpen] = useState(false)
  const [planColVis, setPlanColVis] = useState({ lp: true, sub: true, doc: true, ppu: true, cost: true, gp: true })
  const filterDocWrapRef = useRef<HTMLDivElement>(null)
  const planFilterWrapRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({ past: [], future: [] })
  const isApplyingHistoryRef = useRef(false)
  const boqSplitScrollRef = useRef<HTMLDivElement>(null)
  const [historyTick, setHistoryTick] = useState(0)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle'|'pending'|'saving'|'saved'|'error'>('idle')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Column widths — auto layout by default, switches to fixed on first drag */
  const [colW, setColW] = useState<typeof DEFAULT_WIDTHS>({ ...DEFAULT_WIDTHS })
  const [mainTableFixed, setMainTableFixed] = useState(false)
  const mainTableRef = useRef<HTMLTableElement>(null)
  const resizing = useRef<{ key: ColKey; startX: number; startW: number }|null>(null)

  const resetColLayout = useCallback(() => {
    setMainTableFixed(false)
    setColW({ ...DEFAULT_WIDTHS })
  }, [])

  // Re-measure textareas when table is in auto mode and container resizes
  // (handles the case where column width changes without a drag event)
  useEffect(() => {
    const remeasure = () => {
      mainTableRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(ta => {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }
    const container = boqSplitScrollRef.current
    if (!container) return
    const ro = new ResizeObserver(remeasure)
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  const startResize = useCallback((key: ColKey, e: React.MouseEvent) => {
    e.preventDefault()
    let startW = colW[key]
    if (!mainTableFixed && mainTableRef.current) {
      // Snapshot current auto-sized widths from DOM before switching to fixed
      const newWidths = { ...DEFAULT_WIDTHS }
      mainTableRef.current.querySelectorAll<HTMLElement>('th[data-col]').forEach(th => {
        const k = th.dataset.col as ColKey
        if (k in newWidths) newWidths[k] = Math.round(th.getBoundingClientRect().width)
      })
      startW = newWidths[key]
      setColW(newWidths)
      setMainTableFixed(true)
    }
    resizing.current = { key, startX: e.clientX, startW }
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      const { key: k, startX, startW: sw } = resizing.current
      setColW(p => ({ ...p, [k]: Math.max(40, sw + ev.clientX - startX) }))
    }
    const onUp = () => {
      resizing.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Re-measure textarea heights after column width change
      mainTableRef.current?.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(ta => {
        ta.style.height = 'auto'
        ta.style.height = ta.scrollHeight + 'px'
      })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [colW, mainTableFixed])

  const [sideColW, setSideColW] = useState<typeof DEFAULT_SIDE_WIDTHS>({ ...DEFAULT_SIDE_WIDTHS })
  const resizingSide = useRef<{ key: SideColKey; startX: number; startW: number }|null>(null)

  const startResizeSide = useCallback((key: SideColKey, e: React.MouseEvent) => {
    e.preventDefault()
    resizingSide.current = { key, startX: e.clientX, startW: sideColW[key] }
    const onMove = (ev: MouseEvent) => {
      if (!resizingSide.current) return
      const { key: k, startX, startW } = resizingSide.current
      setSideColW(p => ({ ...p, [k]: Math.max(40, startW + ev.clientX - startX) }))
    }
    const onUp = () => { resizingSide.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sideColW])

  const editing = canEdit && isEditing

  const askConfirm = (msg: string, fn: () => void) => setConfirm({ msg, fn })
  const bumpHistory = () => setHistoryTick(t => t + 1)
  const makeSnapshot = (): EditorSnapshot => ({
    groups,
    planSideRows,
    jobId,
    boqTitle,
    showMat,
    matDetailHidden,
    showLabor,
    showRefId,
    showDesc,
    showQtyUnit,
    showTotal,
    showNote,
    overheadPct,
    vatPct,
    discount,
    discountType,
  })
  const applySnapshot = (s: EditorSnapshot) => {
    setGroups(s.groups)
    setPlanSideRows(s.planSideRows)
    setJobId(s.jobId)
    setBoqTitle(s.boqTitle)
    setShowMat(s.showMat)
    setMatDetailHidden(s.matDetailHidden)
    setShowLabor(s.showLabor)
    setShowRefId(s.showRefId)
    setShowDesc(s.showDesc)
    setShowQtyUnit(s.showQtyUnit)
    setShowTotal(s.showTotal)
    setShowNote(s.showNote)
    setOverheadPct(s.overheadPct)
    setVatPct(s.vatPct)
    setDiscount(s.discount)
    setDiscountType(s.discountType)
  }
  const canUndo = editing && historyRef.current.past.length > 1 && historyTick >= 0
  const canRedo = editing && historyRef.current.future.length > 0 && historyTick >= 0
  const handleUndo = () => {
    const h = historyRef.current
    if (h.past.length <= 1) return
    const current = h.past.pop()
    if (!current) return
    const prev = h.past[h.past.length - 1]
    h.future.push(current)
    isApplyingHistoryRef.current = true
    applySnapshot(prev)
    bumpHistory()
    setTimeout(() => { isApplyingHistoryRef.current = false }, 0)
  }
  const handleRedo = () => {
    const h = historyRef.current
    const next = h.future.pop()
    if (!next) return
    h.past.push(next)
    isApplyingHistoryRef.current = true
    applySnapshot(next)
    bumpHistory()
    setTimeout(() => { isApplyingHistoryRef.current = false }, 0)
  }

  const handleDeleteBoq = () => {
    askConfirm(`ลบ BOQ "${jobName || boqTitle || 'ไม่ระบุชื่อ'}" ?`, () => {
      askConfirm(`ยืนยันอีกครั้ง: ลบ BOQ นี้ถาวร ?`, async () => {
        setDeleting(true)
        setSaveError(null)
        try {
          const res = await fetch(`/api/boq/${id}`, { method: 'DELETE' })
          const d = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(d.error || 'ลบไม่สำเร็จ')
          setConfirm(null)
          router.push('/dashboard/boq')
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
          setDeleting(false)
          setConfirm(null)
        }
      })
    })
  }

  /* load */
  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([fetch(`/api/boq/${id}`).then(r=>r.json()), fetch('/api/jobs').then(r=>r.json())])
      .then(([d, jd]) => {
        setJobs(jd.jobs ?? [])
        if (d.boq) {
          setJobId(d.boq.jobId ?? ''); setBoqTitle(d.boq.title ?? '')
          setJobName(d.boq.job?.name || d.boq.title || '')
          setBoqExists(true)
          // support both old format (array) and new format ({ groups, overheadPct, discount })
          const raw = d.boq.data as
            | Group[]
            | {
                groups: Group[]
                overheadPct?: number
                vatPct?: number
                discount?: number
                discountType?: 'pct' | 'amount'
                planSideRows?: unknown[]
              }
            | null
          const isWrapped = raw && !Array.isArray(raw)
          const loaded: Group[] = isWrapped ? (raw.groups?.length ? raw.groups : [emptyGroup()]) : (Array.isArray(raw) && raw.length ? raw as Group[] : [emptyGroup()])
          const normalizedLoaded = loaded.map(g => ({
            ...g,
            sections: g.sections.map(s => ({ ...s, subRows: s.subRows.map(r => normalizeSubRow(r as SubRow & { children?: SubRow[] })) })),
          }))
          setGroups(normalizedLoaded)
          if (isWrapped) {
            setOverheadPct((raw as { overheadPct?: number }).overheadPct ?? 12)
            setVatPct((raw as { vatPct?: number }).vatPct ?? 7)
            setDiscount((raw as { discount?: number }).discount ?? 0)
            setDiscountType((raw as { discountType?: 'pct' | 'amount' }).discountType ?? 'amount')
          }
          setShowMat(d.boq.showMaterial ?? true)
          const loadedKind = String(d.boq.kind ?? '').toUpperCase()
          const loadedIsActual = loadedKind === 'ACTUAL'
          if (isWrapped && Array.isArray((raw as { planSideRows?: unknown[] }).planSideRows)) {
            setPlanSideRows((raw as { planSideRows: unknown[] }).planSideRows.map(normalizePlanSideRow))
          } else if (!loadedIsActual) {
            setPlanSideRows([emptyPlanSideRow(), emptyPlanSideRow()])
          } else {
            setPlanSideRows([])
          }
          setBoqKind(loadedIsActual ? 'ACTUAL' : 'PLAN')
          const pb = d.boq.planBoq as { title?: string; job?: { name?: string } } | null | undefined
          setPlanRefLabel(pb ? (pb.job?.name || pb.title || null) : null)
          const st = String(d.boq.status ?? 'DRAFT').toUpperCase()
          setBoqStatus(st === 'PENDING' ? 'PENDING' : st === 'APPROVED' ? 'APPROVED' : 'DRAFT')
          setIsEditing(false)

          const planId = d.boq.planBoqId as string | null | undefined
          if (loadedIsActual && planId) {
            fetch(`/api/boq/${planId}`)
              .then(r => r.json())
              .then((pd: { boq?: { data?: unknown } }) => {
                const praw = pd.boq?.data as (Group[] | { groups: Group[] }) | null | undefined
                if (!praw) {
                  setPlanGroups([])
                  setPlanMirrorSideRows([])
                  return
                }
                const pisWrapped = praw && !Array.isArray(praw)
                const ploaded: Group[] = pisWrapped
                  ? (((praw as { groups?: Group[] }).groups?.length ? (praw as { groups: Group[] }).groups : [emptyGroup()]))
                  : (Array.isArray(praw) && praw.length ? (praw as Group[]) : [emptyGroup()])
                setPlanGroups(
                  ploaded.map(g => ({
                    ...g,
                    sections: g.sections.map(s => ({
                      ...s,
                      subRows: s.subRows.map(r => normalizeSubRow(r as SubRow & { children?: SubRow[] })),
                    })),
                  }))
                )
                const pSide = pisWrapped ? (praw as { planSideRows?: unknown[] }).planSideRows : undefined
                setPlanMirrorSideRows(
                  Array.isArray(pSide) && pSide.length > 0 ? pSide.map(normalizePlanSideRow) : []
                )
              })
              .catch(() => {
                setPlanGroups([])
                setPlanMirrorSideRows([])
              })
          } else {
            setPlanGroups([])
            setPlanMirrorSideRows([])
          }
        } else { router.replace('/dashboard/boq') }
      })
      .catch(() => router.replace('/dashboard/boq'))
      .finally(() => setLoading(false))
  }, [id, router])

  useEffect(() => {
    if (!showMat) setMatDetailHidden(false)
  }, [showMat])

  useEffect(() => {
    if (!editing) {
      historyRef.current = { past: [], future: [] }
      bumpHistory()
      return
    }
    historyRef.current = { past: [makeSnapshot()], future: [] }
    bumpHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (!editing || isApplyingHistoryRef.current) return
    const h = historyRef.current
    const snap = makeSnapshot()
    const last = h.past[h.past.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(snap)) return
    h.past.push(snap)
    if (h.past.length > 200) h.past.shift()
    h.future = []
    bumpHistory()
  }, [
    editing,
    groups,
    planSideRows,
    jobId,
    boqTitle,
    showMat,
    matDetailHidden,
    showLabor,
    showRefId,
    showDesc,
    showQtyUnit,
    showTotal,
    showNote,
    overheadPct,
    vatPct,
    discount,
    discountType,
  ])

  useEffect(() => {
    if (!filterOpen) return
    const onDoc = (e: MouseEvent) => {
      if (filterDocWrapRef.current && !filterDocWrapRef.current.contains(e.target as Node)) setFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [filterOpen])

  useEffect(() => {
    if (!planFilterOpen) return
    const onDoc = (e: MouseEvent) => {
      if (planFilterWrapRef.current && !planFilterWrapRef.current.contains(e.target as Node)) setPlanFilterOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [planFilterOpen])

  /* save */
  const handleSave = async () => {
    setSaving(true); setSaveError(null)
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    try {
      const res = await fetch(`/api/boq/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            groups,
            overheadPct,
            vatPct,
            discount: Number(discount) || 0,
            discountType,
            planSideRows,
          },
          showMaterial: showMat,
          jobId: jobId || null,
          title: boqTitle,
        }),
      })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setJobName(d.boq?.job?.name || d.boq?.title || '')
      setAutoSaveStatus('idle')
      setIsEditing(false)
    } catch { setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่') }
    finally { setSaving(false) }
  }

  /* autosave — always-fresh snapshot via ref; timer fires 30 s after last change */
  const latestDataRef = useRef<{
    groups: Group[]; overheadPct: number; vatPct: number; discount: number;
    discountType: string; planSideRows: PlanSideRow[]; showMat: boolean;
    jobId: string | null; boqTitle: string
  } | null>(null)

  useEffect(() => {
    if (!editing || loading || !boqExists) return
    latestDataRef.current = { groups, overheadPct, vatPct, discount: Number(discount) || 0, discountType, planSideRows, showMat, jobId: jobId || null, boqTitle }
    setAutoSaveStatus('pending')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(async () => {
      autoSaveTimerRef.current = null
      const snap = latestDataRef.current
      if (!snap) return
      setAutoSaveStatus('saving')
      try {
        const res = await fetch(`/api/boq/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: { groups: snap.groups, overheadPct: snap.overheadPct, vatPct: snap.vatPct, discount: snap.discount, discountType: snap.discountType, planSideRows: snap.planSideRows }, showMaterial: snap.showMat, jobId: snap.jobId, title: snap.boqTitle }),
        })
        if (!res.ok) throw new Error()
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus(s => s === 'saved' ? 'idle' : s), 4000)
      } catch { setAutoSaveStatus('error') }
    }, 1_500)
  }, [groups, overheadPct, vatPct, discount, discountType, planSideRows, showMat, jobId, boqTitle, editing, loading, boqExists, id])

  /* flush pending autosave when user closes/navigates away */
  useEffect(() => {
    const flush = () => {
      const snap = latestDataRef.current
      if (!snap || !autoSaveTimerRef.current) return
      clearTimeout(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
      const payload = new Blob([JSON.stringify({ data: { groups: snap.groups, overheadPct: snap.overheadPct, vatPct: snap.vatPct, discount: snap.discount, discountType: snap.discountType, planSideRows: snap.planSideRows }, showMaterial: snap.showMat, jobId: snap.jobId, title: snap.boqTitle })], { type: 'application/json' })
      navigator.sendBeacon(`/api/boq/${id}`, payload)
    }
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [id])

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/boq/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit' }),
      })
      if (!res.ok) throw new Error()
      setBoqStatus('PENDING')
    } catch { setSaveError('ส่งขออนุมัติไม่สำเร็จ') }
    finally { setSubmitting(false) }
  }

  const handleSign = async () => {
    setSigning(true)
    try {
      const res = await fetch(`/api/boq/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error()
      setBoqStatus('APPROVED')
    } catch { setSaveError('อนุมัติไม่สำเร็จ') }
    finally { setSigning(false) }
  }

  const handleDownloadPDF = async () => {
    const pageEl = document.querySelector('.boq-page') as HTMLElement | null
    if (!pageEl) return

    // ── Step 1: flush JS input state → DOM attributes so cloneNode copies values ─
    pageEl.querySelectorAll('input').forEach(el => {
      const inp = el as HTMLInputElement
      if (inp.type === 'checkbox') {
        inp.checked ? inp.setAttribute('checked', '') : inp.removeAttribute('checked')
      } else {
        inp.setAttribute('value', inp.value)
      }
    })
    pageEl.querySelectorAll('textarea').forEach(el => {
      const ta = el as HTMLTextAreaElement
      ta.textContent = ta.value
    })

    // ── Step 2: inject CSS that hides PLAN/ACTUAL cols and UI chrome ─────────────
    const tempStyle = document.createElement('style')
    tempStyle.textContent = `
      .boq-pdf-mode .boq-side-th,
      .boq-pdf-mode .boq-side-td           { display: none !important; }
      .boq-pdf-mode .boq-top-bar,
      .boq-pdf-mode .boq-actions,
      .boq-pdf-mode .boq-modal-overlay,
      .boq-pdf-mode .boq-filter-dropdown,
      .boq-pdf-mode .boq-col-resize,
      .boq-pdf-mode .boq-side-panel        { display: none !important; }
      .boq-pdf-mode tr.boq-row--nested          { display: none !important; }
      .boq-pdf-mode tr.boq-thead-triplex-band   { display: none !important; }
      .boq-pdf-mode col.boq-side-col       { width: 0 !important; }
      .boq-pdf-mode .boq-table {
        table-layout: auto  !important;
        width:        auto  !important;
        min-width:    0     !important;
      }
      .boq-pdf-mode .boq-split-scroll,
      .boq-pdf-mode .boq-table-wrapper,
      .boq-pdf-mode .boq-side-table-wrapper {
        overflow:       visible !important;
        max-width:      none    !important;
        container-type: normal  !important;
      }
      .boq-pdf-mode .boq-td,
      .boq-pdf-mode .boq-th { vertical-align: middle !important; }
      .boq-pdf-mode .boq-document-page-header { display: none !important; }
    `
    document.head.appendChild(tempStyle)
    pageEl.classList.add('boq-pdf-mode')

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const liveTableEl = pageEl.querySelector('.boq-table') as HTMLElement | null
    // Use natural content width (table-layout:auto, width:auto) — no forced 1400px minimum
    const liveTableWidth = liveTableEl ? liveTableEl.scrollWidth : 900

    // Clone after CSS + value flush — clone looks exactly like the live page
    const clone = pageEl.cloneNode(true) as HTMLElement

    // Restore live page immediately
    pageEl.classList.remove('boq-pdf-mode')

    // Make clone's table fill the wrapper exactly (wrapper = natural table width)
    clone.querySelectorAll<HTMLElement>('.boq-table').forEach(t => { t.style.width = '100%' })

    // Replace inputs/textareas with spans — html2canvas clips text inside <input>
    // elements to the element's visible area, so we must replace them with spans
    // that let the text flow naturally.
    clone.querySelectorAll('input, textarea, select').forEach(el => {
      const span = document.createElement('span')
      span.className = (el as HTMLElement).className
      span.style.display = el.tagName === 'TEXTAREA' ? 'block' : 'inline-block'
      span.style.width = '100%'
      span.style.boxSizing = 'border-box'
      span.style.whiteSpace = el.tagName === 'TEXTAREA' ? 'pre-wrap' : 'normal'
      if (el instanceof HTMLInputElement) {
        span.textContent = el.type === 'checkbox' ? (el.checked ? '✓' : '') : (el.value || '')
      } else {
        span.textContent = (el as HTMLTextAreaElement | HTMLSelectElement).value || ''
      }
      el.replaceWith(span)
    })

    // Remove interactive chrome from clone (not visible in PDF anyway)
    clone.querySelectorAll('button').forEach(el => el.remove())

    // ── Step 3: build PDF header (company info left, BOQ title right) ────────────
    const header = document.createElement('div')
    header.style.cssText = `
      display:flex;justify-content:space-between;align-items:flex-start;
      padding:0 0 12px 0;margin-bottom:12px;border-bottom:2px solid #333;
      font-family:'Sarabun',system-ui,sans-serif;
    `
    header.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:14px;max-width:55%;">
        <img src="/cheinprodlogo-removebg-preview.png"
             style="height:64px;width:auto;object-fit:contain;flex-shrink:0;" />
        <div style="font-size:12px;line-height:1.6;color:#222;">
          <div style="font-size:14px;font-weight:700;margin-bottom:2px;">
            บริษัท เชน โปรดักชั่น แอนด์ โปรดักส์ จำกัด (สำนักงานใหญ่)
          </div>
          <div>159/25 ถ.สุวินทวงศ์ แขวงแสนแสบ เขตมีนบุรี กรุงเทพมหานคร 10510</div>
          <div>เลขประจำตัวผู้เสียภาษี 0105559081883</div>
          <div>โทร. +666 2635 9647 &nbsp;|&nbsp; +669 0897 9955, +668 3242 2380</div>
        </div>
      </div>
      <div style="text-align:right;font-family:'Sarabun',system-ui,sans-serif;">
        <div style="font-size:26px;font-weight:800;color:#111;margin-bottom:6px;letter-spacing:-0.5px;">ใบถอดแบบ (BOQ)</div>
        ${jobName  ? `<div style="font-size:16px;font-weight:700;color:#333;margin-bottom:2px;">${jobName}</div>`  : ''}
        ${boqTitle ? `<div style="font-size:14px;font-weight:500;color:#555;">${boqTitle}</div>` : ''}
      </div>
    `

    // ── Step 4: loading overlay + render wrapper ─────────────────────────────────
    // Wrapper must be in-viewport and fully visible so the browser paints it.
    // A loading overlay sits on top (higher z-index) so the user sees "กำลัง Export"
    // instead of the raw BOQ content. html2canvas ignores the overlay via ignoreElements.
    const loadingOverlay = document.createElement('div')
    loadingOverlay.setAttribute('data-pdf-overlay', '1')
    loadingOverlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,0.92);z-index:100000;display:flex;align-items:center;justify-content:center;font-size:18px;font-family:'Sarabun',system-ui,sans-serif;color:#333;pointer-events:none;`
    loadingOverlay.textContent = 'กำลัง Export PDF...'
    document.body.appendChild(loadingOverlay)

    const wrapperW = Math.max(liveTableWidth + 40, 600)
    const wrapper = document.createElement('div')
    wrapper.style.cssText = `position:fixed;top:0;left:0;width:${wrapperW}px;background:#fff;padding:20px;box-sizing:border-box;overflow:visible;pointer-events:none;z-index:99999;`
    wrapper.appendChild(header)
    wrapper.appendChild(clone)
    document.body.appendChild(wrapper)

    // Strip triplex row-sync inline heights so rows collapse to natural content size
    clone.querySelectorAll('tr').forEach(row => {
      ;(row as HTMLElement).style.height = ''
      ;(row as HTMLElement).style.minHeight = ''
    })

    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())))

    const naturalWidth  = wrapper.scrollWidth
    const naturalHeight = wrapper.scrollHeight

    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth:  naturalWidth,
        windowHeight: naturalHeight,
        width:  naturalWidth,
        height: naturalHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        ignoreElements: el => el.getAttribute('data-pdf-overlay') === '1',
      })

      const pxToMm = 25.4 / (96 * 2)
      const pdfW = canvas.width  * pxToMm
      const pdfH = canvas.height * pxToMm

      const pdf = new jsPDF({ unit: 'mm', format: [pdfW, pdfH] })
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfW, pdfH)

      const docTitle = (document.querySelector('.boq-doc-title, .boq-page h1') as HTMLElement)?.textContent?.trim() || 'BOQ'
      pdf.save(`${docTitle}.pdf`)
    } finally {
      document.body.removeChild(wrapper)
      document.body.removeChild(loadingOverlay)
      document.head.removeChild(tempStyle)
    }
  }

  /* mutations */
  const addGroup    = () => setGroups(p => [...p, emptyGroup()])
  const delGroup    = (gid: string) => setGroups(p => { const f=p.filter(g=>g.id!==gid); return f.length?f:[emptyGroup()] })
  const updGrpTitle = (gid: string, t: string) => setGroups(p => p.map(g => g.id===gid?{...g,title:t}:g))
  const addSection  = (gid: string) => setGroups(p => p.map(g => g.id===gid?{...g,sections:[...g.sections,emptySection()]}:g))
  const delSection  = (gid: string, sid: string) => setGroups(p => p.map(g => { if(g.id!==gid)return g; const f=g.sections.filter(s=>s.id!==sid); return{...g,sections:f.length?f:[emptySection()]} }))
  const updSecTitle = (gid: string, sid: string, t: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id===sid?{...s,title:t}:s)}))
  const addSubRow   = (gid: string, sid: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:[...s.subRows,emptySubRow()]})}))
  const delSubRow   = (gid: string, sid: string, rid: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:deleteSubRowById(s.subRows,rid,true)})}))
  const updSubRow   = (gid: string, sid: string, rid: string, field: keyof SubRow, val: string|number) =>
    setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:updateSubRowField(s.subRows,rid,field,val)})}))
  const updSubRowMulti = (gid: string, sid: string, rid: string, patch: Partial<SubRow>) =>
    setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:updateSubRowFields(s.subRows,rid,patch)})}))
  const updLineAmount = (gid: string, sid: string, rid: string, kind: 'material' | 'labor', amount: number | '') =>
    setGroups(p =>
      p.map(g => {
        if (g.id !== gid) return g
        return {
          ...g,
          sections: g.sections.map(s => {
            if (s.id !== sid) return s
            const touch = (rows: SubRow[]): SubRow[] =>
              rows.map(r => {
                if (r.id === rid) {
                  const q = Number(r.quantity) || 0
                  const nextQ: number | '' = q > 0 ? r.quantity : (amount === '' ? '' : 1)
                  const unit = unitPriceFromLineAmount(amount, nextQ)
                  return kind === 'material'
                    ? { ...r, quantity: nextQ, materialPrice: unit }
                    : { ...r, quantity: nextQ, laborPrice: unit }
                }
                return { ...r, children: touch(r.children ?? []) }
              })
            return { ...s, subRows: touch(s.subRows) }
          }),
        }
      })
    )
  const addNestedSubRow = (gid: string, sid: string, parentRid: string) =>
    setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:addChildSubRow(s.subRows,parentRid,emptySubRow())})}))

  const updPlanRow = (rowId: string, field: keyof PlanSideRow, val: string | number | '') => {
    setPlanSideRows(rows => rows.map(r => (r.id === rowId ? { ...r, [field]: val } : r)))
  }
  /** Triplex blank slots: first edit materializes a real `PlanSideRow` linked to that BOQ line. */
  const planRowUpdateForTriplexEditor = useCallback(
    (rowId: string, field: keyof PlanSideRow, val: string | number | '') => {
      if (isTriplexPendingPlanRowId(rowId)) {
        const subRowId = rowId.slice(TRIPLEX_PENDING_PLAN_ROW_PREFIX.length)
        setPlanSideRows(rows => {
          const existing = rows.find(r => r.linkedSubRowId === subRowId)
          if (existing) {
            return rows.map(r => (r.id === existing.id ? { ...r, [field]: val } : r))
          }
          return [...rows, {
            ...emptyPlanSideRow(),
            linkedSubRowId: subRowId,
            [field]: val,
          }]
        })
        return
      }
      setPlanSideRows(rows => rows.map(r => (r.id === rowId ? { ...r, [field]: val } : r)))
    },
    [],
  )
  const addPlanRow = () => setPlanSideRows(p => [...p, emptyPlanSideRow()])
  const delPlanRow = (rowId: string) => setPlanSideRows(p => p.filter(r => r.id !== rowId))
  const ensurePlanRowForSubRow = useCallback((subRowId: string) => {
    setPlanSideRows(rows => {
      if (rows.some(r => r.linkedSubRowId === subRowId)) return rows
      return [...rows, { ...emptyPlanSideRow(), linkedSubRowId: subRowId }]
    })
  }, [])

  /* totals */
  const totalItems      = groups.reduce((s,g) => s + g.sections.length, 0)
  const planRowById = useMemo(() => buildPlanRowMap(planGroups), [planGroups])
  /** Actual + loaded plan: always show รายการ + money tail (แผน / งานลด / งานเพิ่ม / รวมหลังปรับ). */
  const actualCompareMode = boqKind === 'ACTUAL' && planGroups.length > 0
  const tableShowDesc = showDesc || actualCompareMode
  const tableShowTotal = showTotal || actualCompareMode

  const colVis: BoqColVis = {
    showRefId,
    showDesc: tableShowDesc,
    showQtyUnit,
    showMaterial: showMat,
    materialCollapsed: showMat && matDetailHidden,
    showLabor,
    showTotal: tableShowTotal,
    showNote: true,
  }
  /** Main BOQ column count (base — without discount cols). Discount cols added after discountAmt is known. */
  const boqMainTableColCountBase = useMemo(() => {
    let n = 1
    if (showRefId) n += 2
    n += 2  // กว้าง + ยาว (always present)
    if (tableShowDesc) n += 1
    if (showQtyUnit) n += 2
    if (showMat && !matDetailHidden) n += 2
    else if (showMat && matDetailHidden) n += 1
    if (showLabor) n += 2
    if (tableShowTotal) n += actualCompareMode ? 4 : 1
    n += 1  // action
    n += 1  // หมายเหตุ
    return n
  }, [
    showRefId,
    tableShowDesc,
    showQtyUnit,
    showMat,
    matDetailHidden,
    showLabor,
    tableShowTotal,
    actualCompareMode,
  ])
  /** ราคาวัสดุสิ่งก่อสร้าง เปิด → ค่าแรงงาน; ปิด → ค่าวัสดุและแรงงาน (ความหมายรวมให้ทีมงาน) */
  const laborGroupHeaderLabel = showMat ? 'ค่าแรงงาน' : 'ค่าวัสดุและแรงงาน'
  const canMutateStructure = editing

  const grandTotal = useMemo(() => {
    if (actualCompareMode) {
      return groups.reduce((s, g) => s + calcGrpAdjustedMoneyTotal(g), 0)
    }
    return groups.reduce((s, g) => s + calcGrpMoneyTotal(g), 0)
  }, [groups, actualCompareMode])

  const grandPlanBase = useMemo(() => {
    if (!actualCompareMode) return 0
    return groups.reduce((s, g) => s + calcGrpPlanBaseMoneyTotal(g, planRowById), 0)
  }, [groups, actualCompareMode, planRowById])

  const grandWorkAdj = useMemo(() => {
    if (!actualCompareMode) return { dec: 0, inc: 0 }
    return groups.reduce(
      (acc, g) => {
        const w = sumWorkAdjustmentsForGroup(g)
        return { dec: acc.dec + w.dec, inc: acc.inc + w.inc }
      },
      { dec: 0, inc: 0 }
    )
  }, [groups, actualCompareMode])
  const overhead        = grandTotal * (overheadPct || 0) / 100
  const subtotalBeforeDiscount = grandTotal + overhead
  const discountNum     = Number(discount) || 0
  const discountAmt     = discountType === 'pct'
    ? subtotalBeforeDiscount * discountNum / 100
    : discountNum
  const afterDiscount   = subtotalBeforeDiscount - discountAmt
  const tableShowSecDiscount = tableShowTotal && showSecDiscount
  /** Final column count including conditional % / ส่วนลดแต่ละข้อ / ยอดงานหลังส่วนลด columns. */
  const boqMainTableColCount = boqMainTableColCountBase + (tableShowSecDiscount ? 3 : 0)
  const boqMainBandColSpans = planBandColSpansForMain(boqMainTableColCount)
  const emptyDiscCells: React.ReactNode = tableShowSecDiscount
    ? <><td className="boq-td boq-summary-cell"/><td className="boq-td boq-summary-cell"/><td className="boq-td boq-summary-cell"/></>
    : undefined
  const vat             = afterDiscount * (vatPct || 0) / 100
  const totalWithVat    = afterDiscount + vat
  /** Per-group share of ส่วนลดพิเศษ by (ยอดหมวด / รวมทุกหมวด) — matches สัดส่วน × ส่วนลดรวม. */
  const groupDiscountAlloc = useMemo(() => {
    const weights = groups.map(g =>
      actualCompareMode ? calcGrpAdjustedMoneyTotal(g) : calcGrpMoneyTotal(g)
    )
    return distributeProportionalAmounts(weights, discountAmt)
  }, [groups, actualCompareMode, discountAmt])

  /** Live map: subRowId → { net: หลังส่วนลด, description (top-level rows only), topLevel } */
  const boqSyncMap = useMemo(() => {
    const map = new Map<string, { description: string; topLevel: boolean; net: number }>()
    const weights = groups.map(g => actualCompareMode ? calcGrpAdjustedMoneyTotal(g) : calcGrpMoneyTotal(g))
    const gDiscs = distributeProportionalAmounts(weights, discountAmt)
    groups.forEach((group, gi) => {
      const gTotal = weights[gi]
      const gDisc = gDiscs[gi]
      const walk = (sr: SubRow, depth: number) => {
        const rowTotal = actualCompareMode ? calcRowTreeAdjusted(sr) : calcRowTreeTotal(sr)
        const rowDisc = gTotal > 0 ? (rowTotal / gTotal) * gDisc : 0
        map.set(sr.id, { description: sr.description, topLevel: depth === 0, net: rowTotal - rowDisc })
        for (const child of sr.children ?? []) walk(child, depth + 1)
      }
      for (const sec of group.sections) for (const sr of sec.subRows) walk(sr, 0)
    })
    return map
  }, [groups, actualCompareMode, discountAmt])

  const { planBoqLinkOptions, planBoqDisplayNoBySubRowId } = useMemo(() => {
    const options = flattenBoqLinesForPlanLink(groups)
    const planBoqDisplayNoBySubRowId: Record<string, string> = {}
    for (const o of options) planBoqDisplayNoBySubRowId[o.subRowId] = o.displayNo
    return { planBoqLinkOptions: options, planBoqDisplayNoBySubRowId }
  }, [groups])

  const { planMirrorLinkOptions, planMirrorDisplayNoBySubRowId } = useMemo(() => {
    const options = flattenBoqLinesForPlanLink(planGroups)
    const planMirrorDisplayNoBySubRowId: Record<string, string> = {}
    for (const o of options) planMirrorDisplayNoBySubRowId[o.subRowId] = o.displayNo
    return { planMirrorLinkOptions: options, planMirrorDisplayNoBySubRowId }
  }, [planGroups])

  const boqTriplexBodySlots = useMemo(
    () => buildBoqTriplexBodySlots(groups, colVis.showDesc, tableShowTotal, showSecDiscount),
    [groups, colVis.showDesc, tableShowTotal, showSecDiscount],
  )
  /** Lookup: group id → render context (needed when iterating flat slots). */
  const groupRenderMap = useMemo(() => {
    const map = new Map<string, { group: Group; idx: number; startSec: number; endSec: number }>()
    let n = 0
    groups.forEach((g, gi) => { const s = n + 1; n += g.sections.length; map.set(g.id, { group: g, idx: gi, startSec: s, endSec: n }) })
    return map
  }, [groups])
  /** Lookup: section id → render context. */
  const sectionRenderMap = useMemo(() => {
    const map = new Map<string, { section: Section; group: Group; globalNum: number }>()
    let n = 0
    groups.forEach(g => g.sections.forEach(sec => { n++; map.set(sec.id, { section: sec, group: g, globalNum: n }) }))
    return map
  }, [groups])
  /** Lookup: subRow id → display number + parent refs. */
  const subRowRenderMap = useMemo(() => {
    const map = new Map<string, { subRow: SubRow; group: Group; section: Section; displayNo: string }>()
    const walk = (rows: SubRow[], g: Group, sec: Section, prefix: string) => {
      rows.forEach((sr, i) => {
        const d = `${prefix}.${i + 1}`
        map.set(sr.id, { subRow: sr, group: g, section: sec, displayNo: d })
        walk(sr.children ?? [], g, sec, d)
      })
    }
    let n = 0
    groups.forEach(g => g.sections.forEach(sec => { n++; walk(sec.subRows, g, sec, String(n)) }))
    return map
  }, [groups])
  const { bySubRow: planBySubRow, orphans: planOrphans } = useMemo(
    () => planRowsBySubRowWithOrphans(planSideRows),
    [planSideRows],
  )
  const { bySubRow: mirrorBySubRow, orphans: mirrorOrphans } = useMemo(
    () => planRowsBySubRowWithOrphans(planMirrorSideRows),
    [planMirrorSideRows],
  )

  const subRowById = useMemo(() => buildSubRowByIdFromGroups(groups), [groups])
  const planMirrorSubRowById = useMemo(() => buildSubRowByIdFromGroups(planGroups), [planGroups])
  const planCostRollupBySubRowId = useMemo(
    () => buildPlanCostRollupBySubRowId(groups, planBySubRow),
    [groups, planBySubRow],
  )
  const mirrorPlanCostRollupBySubRowId = useMemo(
    () => buildPlanCostRollupBySubRowId(planGroups, mirrorBySubRow),
    [planGroups, mirrorBySubRow],
  )
  const planSideFooter = useMemo(
    () =>
      aggregatePlanSideFooter(planSideRows, {
        rollupBySubRowId: planCostRollupBySubRowId,
        subRowById,
      }),
    [planSideRows, planCostRollupBySubRowId, subRowById],
  )
  const planMirrorFooter = useMemo(
    () =>
      aggregatePlanSideFooter(planMirrorSideRows, {
        rollupBySubRowId: mirrorPlanCostRollupBySubRowId,
        subRowById: planMirrorSubRowById,
      }),
    [planMirrorSideRows, mirrorPlanCostRollupBySubRowId, planMirrorSubRowById],
  )

  const planSideEditing = editing && boqKind === 'PLAN'
  const actualSideEditing = editing && boqKind === 'ACTUAL'
  /** Same condition as main BOQ second header row — PLAN thead uses 1 or 2 rows to match height */
  const boqMainHeadSubRow = showRefId || (showMat && !matDetailHidden) || showLabor
  /** Triplex: BOQ gains a 3rd thead row so row count matches PLAN/ACTUAL (less “magic” height math). */
  const boqMainTheadSpan = boqMainHeadSubRow ? 2 : 1

  /* ── Unified-table: PLAN panel context ── */
  const planTxBySubRow   = boqKind === 'ACTUAL' ? mirrorBySubRow    : planBySubRow
  const planTxDisplayNo  = boqKind === 'ACTUAL' ? planMirrorDisplayNoBySubRowId : planBoqDisplayNoBySubRowId
  const planTxLinkOpts   = boqKind === 'ACTUAL' ? planMirrorLinkOptions         : planBoqLinkOptions
  const planTxInteractive= boqKind === 'PLAN' && planSideEditing
  const planTxUpdate     = planRowUpdateForTriplexEditor
  const planTxDelete     = boqKind === 'PLAN' ? delPlanRow : undefined
  const planTxCostRollup = boqKind === 'ACTUAL' ? mirrorPlanCostRollupBySubRowId : planCostRollupBySubRowId
  const planTxSubRowById = boqKind === 'ACTUAL' ? planMirrorSubRowById            : subRowById
  const planTxEnsureRow  = boqKind === 'PLAN' && planSideEditing ? ensurePlanRowForSubRow : undefined
  /* ── Unified-table: ACTUAL panel context (only used when boqKind === 'ACTUAL') ── */
  const actTxBySubRow    = planBySubRow
  const actTxDisplayNo   = planBoqDisplayNoBySubRowId
  const actTxLinkOpts    = planBoqLinkOptions
  const actTxInteractive = actualSideEditing
  const actTxUpdate      = updPlanRow
  const actTxDelete      = delPlanRow
  const actTxCostRollup  = planCostRollupBySubRowId
  const actTxSubRowById  = subRowById
  const actTxEnsureRow   = actualSideEditing ? ensurePlanRowForSubRow : undefined
  /* PlanEmptyCells is defined at module level below PlanSideDataCells */

  let globalSecIdx   = 0

  /* Resize handle elements — double-click RH to reset columns to auto */
  const RH  = ({ col }: { col: ColKey })     => <div className="boq-col-resize" onMouseDown={e => startResize(col, e)} onDoubleClick={resetColLayout} title="ลาก: ปรับขนาด | ดับเบิลคลิก: รีเซ็ต" />
  const RHS = ({ col }: { col: SideColKey }) => <div className="boq-col-resize" onMouseDown={e => startResizeSide(col, e)} />

  /** Section breakdown cells: % + ส่วนลดแต่ละข้อ + ยอดงานหลังส่วนลด */
  const DiscountCells = ({ rowTotal, discountShare, pct }: { rowTotal: number; discountShare: number; pct: number }) => (
    <>
      <td className="boq-td boq-td-num boq-td-sec-pct">{grandTotal > 0 ? `${pct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : ''}</td>
      <td className="boq-td boq-td-num boq-td-sec-discount">{fmt(discountShare)}</td>
      <td className="boq-td boq-td-num boq-td-sec-net">{fmt(rowTotal - discountShare)}</td>
    </>
  )

  const planHideClass = [
    !planColVis.lp   && 'boq-ph-lp',
    !planColVis.sub  && 'boq-ph-sub',
    !planColVis.doc  && 'boq-ph-doc',
    !planColVis.ppu  && 'boq-ph-ppu',
    !planColVis.cost && 'boq-ph-cost',
    !planColVis.gp   && 'boq-ph-gp',
  ].filter(Boolean).join(' ')
  const planFilterActive = Object.values(planColVis).some(v => !v)

  if (loading) return <div className="list-page boq-page"><p style={{ padding:32, color:'#888' }}>กำลังโหลด...</p></div>

  return (
    <div className="list-page boq-page">
      <header className="list-header boq-document-page-header">
        <div>
          <h1 className={`page-title boq-page-title-row ${interTitle.className}`}>
            <span className="boq-page-title-product" lang="en">BOQ</span>
            <span className="boq-page-title-bullet" aria-hidden />
            <span className="boq-page-title-job">{jobName || 'ไม่ระบุงาน'}</span>
          </h1>
          <p className="page-subtitle boq-page-subtitle-line" lang="th">
            {boqKind === 'PLAN' ? (
              <span className="boq-doc-kind boq-doc-kind--plan">Plan</span>
            ) : (
              <span className="boq-doc-kind boq-doc-kind--actual">Actual</span>
            )}
          </p>
          {planRefLabel && (
            <p className="boq-doc-plan-ref-row">
              <span className="boq-doc-plan-ref">Plan: {planRefLabel}</span>
            </p>
          )}
        </div>
        {!canEdit && (
          <div className="boq-document-header-actions">
            <span className="boq-readonly-badge">ดูเท่านั้น</span>
          </div>
        )}
      </header>

      <div className="boq-top-bar">
        <Link href="/dashboard/boq" className="form-button boq-back-btn">← กลับ BOQ แดชบอร์ด</Link>
        {editing ? (
          <div className="boq-editor-meta">
            <div className="boq-meta-field">
              <label className="boq-job-label">ชื่อ BOQ</label>
              <input type="text" className="boq-job-select" value={boqTitle} onChange={e=>setBoqTitle(e.target.value)} placeholder="ชื่อ BOQ" style={{ minWidth:180 }} />
            </div>
            <div className="boq-meta-field">
              <label className="boq-job-label">งาน (Job)</label>
              <select className="boq-job-select" value={jobId} onChange={e=>setJobId(e.target.value)} style={{ minWidth:200 }}>
                <option value="">— ไม่ระบุงาน —</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.name}</option>)}
              </select>
            </div>
          </div>
        ) : (
          <>
            {boqStatus === 'DRAFT' && <span className="boq-status-badge boq-status-draft">ร่าง</span>}
            {boqStatus === 'PENDING' && <span className="boq-status-badge boq-status-pending">รออนุมัติ</span>}
            {boqStatus === 'APPROVED' && <span className="boq-status-badge boq-status-approved">อนุมัติแล้ว</span>}
          </>
        )}
        <div className="boq-top-bar-search-slot" aria-hidden>
          {canDelete && (
            <button
              type="button"
              className="boq-delete-btn"
              onClick={handleDeleteBoq}
              disabled={deleting}
            >
              {deleting ? 'กำลังลบ...' : 'ลบ BOQ'}
            </button>
          )}
        </div>
        <div className="boq-top-bar-actions">
          {canEdit && (
            <div className="boq-top-bar-edit-cluster">
              {canMutateStructure && (
                <button type="button" className="boq-add-row-btn" onClick={addGroup}>
                  + เพิ่มหมวดงาน
                </button>
              )}
              {editing ? (
                <>
                  <button type="button" className="boq-history-btn" onClick={handleUndo} disabled={!canUndo} title="Undo">
                    Undo
                  </button>
                  <button type="button" className="boq-history-btn" onClick={handleRedo} disabled={!canRedo} title="Redo">
                    Redo
                  </button>
                  <button type="button" className="boq-save-btn" onClick={handleSave} disabled={saving}>
                    {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
                  </button>
                  {autoSaveStatus === 'pending' && <span className="boq-autosave-indicator boq-autosave-indicator--pending">จะบันทึกอัตโนมัติ...</span>}
                  {autoSaveStatus === 'saving' && <span className="boq-autosave-indicator boq-autosave-indicator--saving">กำลังบันทึกอัตโนมัติ...</span>}
                  {autoSaveStatus === 'saved' && <span className="boq-autosave-indicator boq-autosave-indicator--saved">✓ บันทึกอัตโนมัติแล้ว</span>}
                  {autoSaveStatus === 'error' && <span className="boq-autosave-indicator boq-autosave-indicator--error">บันทึกอัตโนมัติล้มเหลว</span>}
                </>
              ) : (
                <button type="button" className="boq-edit-btn" onClick={() => setIsEditing(true)}>
                  ✏️ แก้ไข
                </button>
              )}
              {saveError && <span className="boq-save-error">{saveError}</span>}
            </div>
          )}
          {canSubmit && boqStatus === 'DRAFT' && !isEditing && boqExists && (
            <button type="button" className="boq-submit-btn" onClick={() => askConfirm('ส่ง BOQ นี้ขออนุมัติ?', () => { setConfirm(null); void handleSubmit() })} disabled={submitting}>
              {submitting ? 'กำลังส่ง...' : 'ส่งขออนุมัติ'}
            </button>
          )}
          {canSign && boqStatus === 'PENDING' && (
            <button type="button" className="boq-sign-btn" onClick={() => askConfirm('อนุมัติและลงนาม BOQ นี้?', () => { setConfirm(null); void handleSign() })} disabled={signing}>
              {signing ? 'กำลังอนุมัติ...' : 'อนุมัติ / ลงนาม'}
            </button>
          )}
          <button type="button" className="boq-submit-btn" onClick={() => { void handleDownloadPDF() }}>
            Export PDF
          </button>
          <div className="boq-filter-wrap" ref={filterDocWrapRef}>
            <button
              type="button"
              className={`boq-filter-btn${(boqColVisFilterActive(colVis) || !showSecDiscount) ? ' boq-filter-btn--active' : ''}`}
              onClick={() => setFilterOpen(o => !o)}
              aria-expanded={filterOpen}
              aria-haspopup="true"
            >
              <svg className="boq-filter-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              กรอง
            </button>
            {filterOpen && (
              <div className="boq-filter-dropdown boq-filter-dropdown--wide" role="menu">
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={showRefId} onChange={e => setShowRefId(e.target.checked)} />
                  <span>1. อ้างอิง ID</span>
                </label>
                <label className="boq-filter-dropdown__option" title={actualCompareMode ? 'Actual ที่ผูกแผนต้องแสดงคอลัมน์นี้' : undefined}>
                  <input type="checkbox" checked={tableShowDesc} disabled={actualCompareMode} onChange={e => { if (!actualCompareMode) setShowDesc(e.target.checked) }} />
                  <span>2. รายการ</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={showQtyUnit} onChange={e => setShowQtyUnit(e.target.checked)} />
                  <span>3. จำนวน + หน่วย</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={showMat} onChange={e => setShowMat(e.target.checked)} />
                  <span>4. ราคาวัสดุสิ่งก่อสร้าง</span>
                </label>
                <label
                  className="boq-filter-dropdown__option"
                  title="ปิด 'ราคาวัสดุสิ่งก่อสร้าง' แล้วหัวคอลัมน์นี้จะใช้ชื่อ ค่าวัสดุและแรงงาน แทน ค่าแรงงาน"
                >
                  <input type="checkbox" checked={showLabor} onChange={e => setShowLabor(e.target.checked)} />
                  <span>5. {laborGroupHeaderLabel}</span>
                </label>
                <label className="boq-filter-dropdown__option" title={actualCompareMode ? 'Actual ที่ผูกแผนต้องแสดงคอลัมน์นี้ (รวมแผน / งานลด / เพิ่ม)' : undefined}>
                  <input type="checkbox" checked={tableShowTotal} disabled={actualCompareMode} onChange={e => { if (!actualCompareMode) setShowTotal(e.target.checked) }} />
                  <span>6. รวมค่าวัสดุและแรงงาน</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={showSecDiscount} onChange={e => setShowSecDiscount(e.target.checked)} />
                  <span>7. % / ส่วนลดแต่ละข้อ / ยอดหลังส่วนลด</span>
                </label>

                <button type="button" className="boq-filter-dropdown__close" onClick={() => setFilterOpen(false)}>
                  ปิด
                </button>
              </div>
            )}
          </div>
          <div className="boq-filter-wrap" ref={planFilterWrapRef}>
            <button
              type="button"
              className={`boq-filter-btn${planFilterActive ? ' boq-filter-btn--active' : ''}`}
              onClick={() => setPlanFilterOpen(o => !o)}
              aria-expanded={planFilterOpen}
              aria-haspopup="true"
            >
              <svg className="boq-filter-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              กรอง PLAN
            </button>
            {planFilterOpen && (
              <div className="boq-filter-dropdown boq-filter-dropdown--wide" role="menu">
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.lp} onChange={e => setPlanColVis(v => ({ ...v, lp: e.target.checked }))} />
                  <span>ราคาขาย BOQ</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.sub} onChange={e => setPlanColVis(v => ({ ...v, sub: e.target.checked }))} />
                  <span>Sub</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.doc} onChange={e => setPlanColVis(v => ({ ...v, doc: e.target.checked }))} />
                  <span>เลขที่เอกสาร</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.ppu} onChange={e => setPlanColVis(v => ({ ...v, ppu: e.target.checked }))} />
                  <span>ราคา/หน่วย</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.cost} onChange={e => setPlanColVis(v => ({ ...v, cost: e.target.checked }))} />
                  <span>ราคาทุน</span>
                </label>
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={planColVis.gp} onChange={e => setPlanColVis(v => ({ ...v, gp: e.target.checked }))} />
                  <span>GP% + GP Amount</span>
                </label>
                <button type="button" className="boq-filter-dropdown__close" onClick={() => setPlanFilterOpen(false)}>
                  ปิด
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`boq-split-scroll boq-split-scroll--triplex${planHideClass ? ` ${planHideClass}` : ''}`} ref={boqSplitScrollRef}>
      <div className="boq-table-wrapper boq-table-wrapper--triplex">
        <table ref={mainTableRef} className={`boq-table${mainTableFixed ? ' boq-table--fixed' : ''}${editing ? '' : ' boq-table--readonly'}`}>
          <colgroup>
            {/* ── BOQ cols ── */}
            <col style={mainTableFixed ? { width: colW.no } : undefined} />
            {showRefId && (
              <>
                <col style={mainTableFixed ? { width: colW.refPage } : undefined} />
                <col style={mainTableFixed ? { width: colW.refCode } : undefined} />
              </>
            )}
            {tableShowDesc && <col style={mainTableFixed ? { width: colW.desc } : undefined} />}
            <col style={mainTableFixed ? { width: colW.width } : undefined} />
            <col style={mainTableFixed ? { width: colW.length } : undefined} />
            {showQtyUnit && (
              <>
                <col style={mainTableFixed ? { width: colW.qty } : undefined} />
                <col style={mainTableFixed ? { width: colW.unit } : undefined} />
              </>
            )}
            {showMat && !matDetailHidden && (
              <>
                <col style={mainTableFixed ? { width: colW.matPrice } : undefined} />
                <col style={mainTableFixed ? { width: colW.matAmt } : undefined} />
              </>
            )}
            {showMat && matDetailHidden && <col style={{ width: 36 }} />}
            {showLabor && (
              <>
                <col style={mainTableFixed ? { width: colW.laborPrice } : undefined} />
                <col style={mainTableFixed ? { width: colW.laborAmt } : undefined} />
              </>
            )}
            {tableShowTotal && (
              actualCompareMode ? (
                <>
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                  <col style={mainTableFixed ? { width: colW.total } : undefined} />
                </>
              ) : (
                <col style={mainTableFixed ? { width: colW.total } : undefined} />
              )
            )}
            {editing && <col style={mainTableFixed ? { width: colW.action } : undefined} />}
            <col style={mainTableFixed ? { width: colW.note } : undefined} />
            {tableShowSecDiscount && (
              <>
                <col style={mainTableFixed ? { width: colW.secPct } : undefined} />
                <col style={mainTableFixed ? { width: colW.secDiscount } : undefined} />
                <col style={mainTableFixed ? { width: colW.secNet } : undefined} />
              </>
            )}
            {/* ── PLAN cols (10) ── */}
            <col className="boq-side-col boq-side-col--boq-ref" style={{ width: sideColW.ref }} />
            <col className="boq-side-col boq-side-col--lead ppc-lp"    style={{ width: sideColW.lead }} />
            <col className="boq-side-col boq-side-col--sub ppc-sub"     style={{ width: sideColW.sub }} />
            <col className="boq-side-col ppc-di" style={{ width: sideColW.docIssue }} />
            <col className="boq-side-col ppc-dt" style={{ width: sideColW.docTitle }} />
            <col className="boq-side-col ppc-ppu" style={{ width: sideColW.pricePerUnit }} />
            <col className="boq-side-col ppc-cost" style={{ width: sideColW.cost }} />
            <col className="boq-side-col ppc-gppct" style={{ width: sideColW.gpPct }} />
            <col className="boq-side-col ppc-gpamt" style={{ width: sideColW.gpAmt }} />
            <col className="boq-side-col" style={{ width: sideColW.sell }} />
            {/* ── ACTUAL cols (10, only when boqKind==='ACTUAL') ── */}
            {boqKind === 'ACTUAL' && (<>
              <col className="boq-side-col boq-side-col--boq-ref" />
              <col className="boq-side-col boq-side-col--lead" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
              <col className="boq-side-col" />
            </>)}
          </colgroup>

          <thead>
            {/* ── Band row (only when multi-row thead) ── */}
            {boqMainHeadSubRow && (
              <tr className="boq-thead-triplex-band">
                <th colSpan={boqMainTableColCount - (editing ? 0 : 1)} className="boq-th boq-side-th boq-side-th--plan-band" lang="en">
                  BOQ
                </th>
                <th colSpan={10} className="boq-th boq-side-th boq-side-th--plan-band boq-side-td--panel-start" lang="en">
                  PLAN
                </th>
                {boqKind === 'ACTUAL' && (
                  <th colSpan={10} className="boq-th boq-side-th boq-side-th--plan-band boq-side-td--panel-start" lang="en">
                    ACTUAL
                  </th>
                )}
              </tr>
            )}
            {/* ── Main headers row ── */}
            <tr>
              <th data-col="no" rowSpan={boqMainTheadSpan} className="boq-th boq-th-no">ลำดับที่<RH col="no"/></th>
              {showRefId && (
                <th colSpan={2} className="boq-th boq-th-ref-head">อ้างอิง ID</th>
              )}
              {tableShowDesc && (
                <th data-col="desc" rowSpan={boqMainTheadSpan} className="boq-th boq-th-desc">รายการ<RH col="desc"/></th>
              )}
              <th data-col="width" rowSpan={boqMainTheadSpan} className="boq-th boq-th-qty">กว้าง<RH col="width"/></th>
              <th data-col="length" rowSpan={boqMainTheadSpan} className="boq-th boq-th-qty">ยาว<RH col="length"/></th>
              {showQtyUnit && (
                <>
                  <th data-col="qty" rowSpan={boqMainTheadSpan} className="boq-th boq-th-qty">จำนวน<RH col="qty"/></th>
                  <th data-col="unit" rowSpan={boqMainTheadSpan} className="boq-th boq-th-unit">หน่วย<RH col="unit"/></th>
                </>
              )}
              {showMat && !matDetailHidden && (
                <th colSpan={2} className="boq-th boq-th-mat-head">
                  <span className="boq-th-mat-head__title">ราคาวัสดุสิ่งก่อสร้าง</span>
                  <button
                    type="button"
                    className="boq-th-mat-head__hide"
                    onClick={() => setMatDetailHidden(true)}
                    title="ซ่อนคอลัมน์ราคาวัสดุ (คลิก + ที่คอลัมน์แคบเพื่อเปิดกลับ)"
                    aria-label="ซ่อนคอลัมน์ราคาวัสดุ"
                  >
                    −
                  </button>
                </th>
              )}
              {showMat && matDetailHidden && (
                <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-mat-collapsed-head">
                  <button
                    type="button"
                    className="boq-ref-toggle-btn"
                    onClick={() => setMatDetailHidden(false)}
                    title="แสดงราคาวัสดุสิ่งก่อสร้าง"
                    aria-label="แสดงคอลัมน์ราคาวัสดุ"
                  >
                    +
                  </button>
                </th>
              )}
              {showLabor && (
                <th colSpan={2} className="boq-th">{laborGroupHeaderLabel}</th>
              )}
              {tableShowTotal && (
                actualCompareMode ? (
                  <>
                    <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-plan-mirror">แผน<br/><span className="boq-th-subhint">(รวม)</span></th>
                    <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-var">งานลด</th>
                    <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-var">งานเพิ่ม</th>
                    <th data-col="total" rowSpan={boqMainTheadSpan} className="boq-th boq-th-total">
                      รวมค่าวัสดุและแรงงาน
                      <RH col="total" />
                    </th>
                  </>
                ) : (
                  <th data-col="total" rowSpan={boqMainTheadSpan} className="boq-th boq-th-total">
                    รวมค่าวัสดุและแรงงาน
                    <RH col="total" />
                  </th>
                )
              )}
              {editing && <th data-col="action" rowSpan={boqMainTheadSpan} className="boq-th boq-th-action"><RH col="action"/></th>}
              <th data-col="note" rowSpan={boqMainTheadSpan} className="boq-th boq-th-note">หมายเหตุ<RH col="note"/></th>
              {tableShowSecDiscount && (
                <>
                  <th data-col="secPct" rowSpan={boqMainTheadSpan} className="boq-th boq-th-num boq-td-sec-pct">%<RH col="secPct"/></th>
                  <th data-col="secDiscount" rowSpan={boqMainTheadSpan} className="boq-th boq-th-num boq-td-sec-discount">ส่วนลดแต่ละข้อ<RH col="secDiscount"/></th>
                  <th data-col="secNet" rowSpan={boqMainTheadSpan} className="boq-th boq-th-num boq-td-sec-net">หลังส่วนลด<RH col="secNet"/></th>
                </>
              )}
              {/* ── PLAN main headers ── */}
              {boqMainHeadSubRow ? (<>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--boq-ref-head boq-side-td--panel-start" title="ลำดับบรรทัด BOQ">ลำดับ BOQ<RHS col="ref"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead ppc-lp">ราคาขาย<RHS col="lead"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf ppc-sub">Sub<RHS col="sub"/></th>
                <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main ppc-di ppc-dt">เลขที่เอกสาร</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf ppc-ppu">ราคา/หน่วย<RHS col="pricePerUnit"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf ppc-cost">ราคาทุน<RHS col="cost"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf ppc-gppct">GP%<RHS col="gpPct"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf ppc-gpamt">GP Amount<RHS col="gpAmt"/></th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">ราคาขาย<RHS col="sell"/></th>
              </>) : (<>
                <th className="boq-th boq-side-th boq-side-th--boq-ref-head boq-side-td--panel-start">ลำดับ BOQ<RHS col="ref"/></th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead ppc-lp"><span className="boq-side-th__kind" lang="en">PLAN</span><span className="boq-side-th__rowhead-label">ราคาขาย</span><RHS col="lead"/></th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf ppc-sub">Sub<RHS col="sub"/></th>
                <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main-merged ppc-di ppc-dt">เลขที่เอกสาร</th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf ppc-ppu">ราคา/หน่วย<RHS col="pricePerUnit"/></th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf ppc-cost">ราคาทุน<RHS col="cost"/></th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf ppc-gppct">GP%<RHS col="gpPct"/></th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf ppc-gpamt">GP Amount<RHS col="gpAmt"/></th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf">ราคาขาย<RHS col="sell"/></th>
              </>)}
              {/* ── ACTUAL main headers ── */}
              {boqKind === 'ACTUAL' && (boqMainHeadSubRow ? (<>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--boq-ref-head boq-side-td--panel-start">ลำดับ BOQ</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead">ราคาขาย</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">Sub</th>
                <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main">เลขที่เอกสาร</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">ราคา/หน่วย</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf">ราคาทุน</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">GP%</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">GP Amount</th>
                <th rowSpan={2} className="boq-th boq-side-th boq-side-th--sell-leaf">ราคาขาย</th>
              </>) : (<>
                <th className="boq-th boq-side-th boq-side-th--boq-ref-head boq-side-td--panel-start">ลำดับ BOQ</th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--rowhead"><span className="boq-side-th__kind" lang="en">ACTUAL</span><span className="boq-side-th__rowhead-label">ราคาขาย</span></th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf">Sub</th>
                <th colSpan={2} className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-main-merged">เลขที่เอกสาร</th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf">ราคา/หน่วย</th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf">ราคาทุน</th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf">GP%</th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf">GP Amount</th>
                <th className="boq-th boq-side-th boq-side-th--sell-leaf">ราคาขาย</th>
              </>))}
            </tr>
            {/* ── Sub-headers row (only when boqMainHeadSubRow) ── */}
            {boqMainHeadSubRow && (
              <tr>
                {showRefId && (<>
                  <th data-col="refPage" className="boq-th boq-th-sub">เลขหน้า<RH col="refPage"/></th>
                  <th data-col="refCode" className="boq-th boq-th-sub">รหัส<RH col="refCode"/></th>
                </>)}
                {showMat && !matDetailHidden && (<>
                  <th data-col="matPrice" className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="matPrice"/></th>
                  <th data-col="matAmt" className="boq-th boq-th-sub">จำนวนเงิน<RH col="matAmt"/></th>
                </>)}
                {showLabor && (<>
                  <th data-col="laborPrice" className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="laborPrice"/></th>
                  <th data-col="laborAmt" className="boq-th boq-th-sub">จำนวนเงิน<RH col="laborAmt"/></th>
                </>)}
                {/* PLAN doc sub-headers */}
                <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf ppc-di">เลขที่<RHS col="docIssue"/></th>
                <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf ppc-dt">เอกสาร<RHS col="docTitle"/></th>
                {/* ACTUAL doc sub-headers */}
                {boqKind === 'ACTUAL' && (<>
                  <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf">เลขที่</th>
                  <th className="boq-th boq-side-th boq-side-th--cost-leaf boq-side-th--doc-leaf">เอกสาร</th>
                </>)}
              </tr>
            )}
          </thead>

          <tbody>
            {groups.map((group, groupIdx) => {
              const groupStartSec = globalSecIdx + 1
              globalSecIdx += group.sections.length
              const groupEndSec = globalSecIdx
              const groupTotal = actualCompareMode
                ? calcGrpAdjustedMoneyTotal(group)
                : calcGrpMoneyTotal(group)
              const groupSummaryFour = actualCompareMode
                ? (() => {
                    const pb = calcGrpPlanBaseMoneyTotal(group, planRowById)
                    const { dec, inc } = sumWorkAdjustmentsForGroup(group)
                    return { plan: fmt(pb), dec: fmt(dec), inc: fmt(inc), adj: fmt(groupTotal) }
                  })()
                : undefined
              const rowTail = boqTailAfterTitle(colVis)
              const getLinkedPlanQty = (subRowId: string): number | undefined => {
                const sr = planTxSubRowById?.get(subRowId)
                if (!sr || sr.quantity === '') return undefined
                return Number(sr.quantity)
              }
              const getLinkedActQty = (subRowId: string): number | undefined => {
                const sr = actTxSubRowById?.get(subRowId)
                if (!sr || sr.quantity === '') return undefined
                return Number(sr.quantity)
              }
              // PLAN group summary cells
              const planGroupSummaryCells = (() => {
                let sumCost = 0, sumGp = 0, sumSell = 0, weightedGp = 0
                const allSubRowIds = group.sections.flatMap(sec => sec.subRows.map(sr => sr.id))
                for (const sid of allSubRowIds) {
                  const pr = planTxBySubRow.get(sid)
                  if (!pr) continue
                  const c = effectivePlanCostForRow(pr, planTxCostRollup, planTxSubRowById)
                  const { gpAmount, sellPrice } = planSideRowDerived(pr, c)
                  sumCost += c; sumGp += gpAmount; sumSell += sellPrice
                  weightedGp += c * (Number(pr.gpPct) || 0)
                }
                const avgGpPct = sumCost > 0 ? weightedGp / sumCost : 0
                return (<>
                  <td className="boq-td boq-td-no boq-side-td boq-side-td--boq-ref boq-side-td--panel-start" />
                  <td className="boq-td boq-td-num boq-side-td" />
                  <td className="boq-td boq-side-td" colSpan={4} />
                  <td className="boq-td boq-td-num boq-side-td">{fmt(sumCost)}</td>
                  <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell boq-side-td--gp-avg">
                    {sumCost > 0 ? `${avgGpPct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : ''}
                  </td>
                  <td className="boq-td boq-td-num boq-td-calc boq-side-td">{fmt(sumGp)}</td>
                  <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell">{fmt(sumSell)}</td>
                </>)
              })()
              const actGroupSummaryCells = boqKind === 'ACTUAL' ? (() => {
                let sumCost = 0, sumGp = 0, sumSell = 0, weightedGp = 0
                const allSubRowIds = group.sections.flatMap(sec => sec.subRows.map(sr => sr.id))
                for (const sid of allSubRowIds) {
                  const pr = actTxBySubRow.get(sid)
                  if (!pr) continue
                  const c = effectivePlanCostForRow(pr, actTxCostRollup, actTxSubRowById)
                  const { gpAmount, sellPrice } = planSideRowDerived(pr, c)
                  sumCost += c; sumGp += gpAmount; sumSell += sellPrice
                  weightedGp += c * (Number(pr.gpPct) || 0)
                }
                const avgGpPct = sumCost > 0 ? weightedGp / sumCost : 0
                return (<>
                  <td className="boq-td boq-td-no boq-side-td boq-side-td--boq-ref boq-side-td--panel-start" />
                  <td className="boq-td boq-td-num boq-side-td" />
                  <td className="boq-td boq-side-td" colSpan={4} />
                  <td className="boq-td boq-td-num boq-side-td">{fmt(sumCost)}</td>
                  <td className="boq-td boq-td-num boq-side-td boq-side-td--segment-sell boq-side-td--gp-avg">
                    {sumCost > 0 ? `${avgGpPct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : ''}
                  </td>
                  <td className="boq-td boq-td-num boq-td-calc boq-side-td">{fmt(sumGp)}</td>
                  <td className="boq-td boq-td-num boq-td-total boq-side-td boq-side-td--last-cell">{fmt(sumSell)}</td>
                </>)
              })() : null
              return (
                <React.Fragment key={group.id}>
                  {colVis.showDesc && (
                  <tr className="boq-group-header-row">
                    <td className="boq-td boq-td-group-no">{groupIdx + 1}</td>
                    {showRefId && <><td className="boq-td"/><td className="boq-td"/></>}
                    {!tableShowDesc ? (
                      <td colSpan={boqLeadTitleColSpan(colVis)} className="boq-td boq-td-group-title-cell">
                        <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing}
                          onChange={e => editing && updGrpTitle(group.id, e.target.value)}
                          placeholder={`หมวดงานที่ ${groupIdx+1} — พิมพ์ชื่อหมวดงาน`} />
                      </td>
                    ) : (
                      <td className="boq-td boq-td-group-title-cell">
                        <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing}
                          onChange={e => editing && updGrpTitle(group.id, e.target.value)}
                          placeholder={`หมวดงานที่ ${groupIdx+1} — พิมพ์ชื่อหมวดงาน`} />
                      </td>
                    )}
                    {tableShowDesc && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.qty2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.matSlots === 2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.matSlots === 1 && <td className="boq-td"/>}
                    {rowTail.lab2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.tot && (actualCompareMode ? <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></> : <td className="boq-td"/>)}
                    <td className="boq-td boq-td-action">
                      {canMutateStructure && (
                        <div className="boq-action-cell">
                          <button type="button" className="boq-btn boq-action-btn-section-del"
                            onClick={() => askConfirm(`ลบหมวดงานที่ ${groupIdx+1} "${group.title||'ไม่มีชื่อ'}" ?`, () => { delGroup(group.id); setConfirm(null) })}
                            title="ลบหมวดงานนี้">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                            </svg>
                          </button>
                          <button type="button" className="boq-btn boq-action-btn-add" onClick={() => addSection(group.id)} title="เพิ่มข้อในหมวดนี้">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                    {rowTail.note && <td className="boq-td"/>}
                    {tableShowSecDiscount && <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></>}
                    <PlanEmptyCells panelStart />
                    {boqKind === 'ACTUAL' && <PlanEmptyCells panelStart />}
                  </tr>
                  )}

                  {group.sections.map((section, secIdx) => {
                    const globalNum = groupStartSec + secIdx
                    const secTail = boqTailAfterTitle(colVis)
                    return (
                      <React.Fragment key={section.id}>
                        {colVis.showDesc && (
                        <tr className="boq-section-header-row">
                          <td className="boq-td boq-td-no boq-td-section-no">{globalNum}</td>
                          {showRefId && <><td className="boq-td"/><td className="boq-td"/></>}
                          {!tableShowDesc ? (
                            <td colSpan={boqLeadTitleColSpan(colVis)} className="boq-td boq-td-section-title-cell">
                              <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing}
                                onChange={e => editing && updSecTitle(group.id, section.id, e.target.value)}
                                placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                            </td>
                          ) : (
                            <td className="boq-td boq-td-section-title-cell">
                              <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing}
                                onChange={e => editing && updSecTitle(group.id, section.id, e.target.value)}
                                placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                            </td>
                          )}
                          {tableShowDesc && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.qty2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.matSlots === 2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.matSlots === 1 && <td className="boq-td"/>}
                          {secTail.lab2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.tot && (actualCompareMode ? <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></> : <td className="boq-td"/>)}
                          <td className="boq-td boq-td-action"/>
                          {secTail.note && <td className="boq-td"/>}
                          {tableShowSecDiscount && <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></>}
                          <PlanEmptyCells panelStart />
                          {boqKind === 'ACTUAL' && <PlanEmptyCells panelStart />}
                        </tr>
                        )}

                        {(() => {
                          const secTotal = actualCompareMode ? calcSecAdjustedMoneyTotal(section) : calcSecMoneyTotal(section)
                          const groupDisc = groupDiscountAlloc[groupIdx] ?? 0
                          const renderBoqLines = (rows: SubRow[], numPrefix: string, depth: number): React.ReactNode[] =>
                            rows.flatMap((sr, i) => {
                              const displayNo = `${numPrefix}.${i + 1}`
                              const nestedNoCls = depth >= 1 ? ' boq-td-sub-no--nested' : ''
                              const planSr = planRowById.get(sr.id)
                              const rowLocked = !editing
                              const planRow = planTxBySubRow.get(sr.id)
                              const actRow = actTxBySubRow.get(sr.id)
                              const rowTotal = actualCompareMode ? calcRowTreeAdjusted(sr) : calcRowTreeTotal(sr)
                              const rowPct = secTotal > 0 ? (rowTotal / secTotal) * 100 : 0
                              const rowDiscountShare = groupTotal > 0 ? (rowTotal / groupTotal) * groupDisc : 0
                              const boqSync = boqSyncMap.get(sr.id)
                              const syncedNet = boqSync?.net
                              const syncedDesc = boqSync?.topLevel ? boqSync.description : undefined
                              const planCells = planRow ? (
                                <PlanSideDataCells r={planRow} ro={!planTxInteractive} interactive={planTxInteractive}
                                  boqRefLinkLocked rolledUpPlanCost={planTxCostRollup?.get(sr.id)}
                                  linkedSubRowQuantity={getLinkedPlanQty(sr.id)}
                                  displayNoBySubRowId={planTxDisplayNo} linkOptions={planTxLinkOpts}
                                  onUpdateRow={planTxUpdate} onDeleteRow={planTxDelete} panelStart
                                  syncedListPrice={syncedNet} syncedSub={syncedDesc} />
                              ) : planTxInteractive && planTxEnsureRow ? (
                                <PlanSideDataCells
                                  r={{ ...emptyPlanSideRow(), id: triplexPendingPlanRowId(sr.id), linkedSubRowId: sr.id }}
                                  ro={false} interactive={true} boqRefLinkLocked
                                  rolledUpPlanCost={planTxCostRollup?.get(sr.id)}
                                  linkedSubRowQuantity={getLinkedPlanQty(sr.id)}
                                  displayNoBySubRowId={planTxDisplayNo} linkOptions={planTxLinkOpts}
                                  onUpdateRow={planTxUpdate} onDeleteRow={planTxDelete} panelStart
                                  syncedListPrice={syncedNet} syncedSub={syncedDesc} />
                              ) : (syncedNet !== undefined) ? (
                                <PlanSideDataCells
                                  r={{ ...emptyPlanSideRow(), id: triplexPendingPlanRowId(sr.id), linkedSubRowId: sr.id }}
                                  ro={true} interactive={false} boqRefLinkLocked
                                  displayNoBySubRowId={planTxDisplayNo} linkOptions={planTxLinkOpts}
                                  onUpdateRow={planTxUpdate} panelStart
                                  syncedListPrice={syncedNet} syncedSub={syncedDesc} />
                              ) : <PlanEmptyCells panelStart />
                              const actCells = boqKind === 'ACTUAL' ? (actRow ? (
                                <PlanSideDataCells r={actRow} ro={!actTxInteractive} interactive={actTxInteractive}
                                  boqRefLinkLocked rolledUpPlanCost={actTxCostRollup?.get(sr.id)}
                                  linkedSubRowQuantity={getLinkedActQty(sr.id)}
                                  displayNoBySubRowId={actTxDisplayNo} linkOptions={actTxLinkOpts}
                                  onUpdateRow={actTxUpdate} onDeleteRow={actTxDelete} panelStart
                                  syncedListPrice={syncedNet} syncedSub={syncedDesc} />
                              ) : actTxInteractive && actTxEnsureRow ? (
                                <PlanSideDataCells
                                  r={{ ...emptyPlanSideRow(), id: triplexPendingPlanRowId(sr.id), linkedSubRowId: sr.id }}
                                  ro={false} interactive={true} boqRefLinkLocked
                                  rolledUpPlanCost={actTxCostRollup?.get(sr.id)}
                                  linkedSubRowQuantity={getLinkedActQty(sr.id)}
                                  displayNoBySubRowId={actTxDisplayNo} linkOptions={actTxLinkOpts}
                                  onUpdateRow={actTxUpdate} onDeleteRow={actTxDelete} panelStart
                                  syncedListPrice={syncedNet} syncedSub={syncedDesc} />
                              ) : <PlanEmptyCells panelStart />) : null
                              return [
                                <tr key={sr.id} className={depth >= 1 ? 'boq-row boq-row--nested' : 'boq-row'}>
                                  <td className={`boq-td boq-td-no boq-td-sub-no${nestedNoCls}`}>{displayNo}</td>
                                  {showRefId && (
                                    <>
                                      <td className="boq-td"><input className="boq-input" value={sr.refPage} readOnly={rowLocked} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'refPage',e.target.value)}/></td>
                                      <td className="boq-td"><input className="boq-input" value={sr.refCode} readOnly={rowLocked} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'refCode',e.target.value)}/></td>
                                    </>
                                  )}
                                  {tableShowDesc && (
                                    <td className="boq-td boq-td-desc">
                                      <AutoTextarea className="boq-input boq-textarea" value={sr.description} readOnly={rowLocked}
                                        onChange={v => editing && updSubRow(group.id,section.id,sr.id,'description',v)}
                                        placeholder={editing ? `รายการที่ ${displayNo}` : ''} />
                                    </td>
                                  )}
                                  <td className="boq-td boq-td-num">
                                    <NumInput className="boq-input boq-input-num" value={sr.width ?? ''} readOnly={rowLocked} onChange={v => {
                                      if (!editing) return
                                      const w = v === '' ? '' : Number(v)
                                      const l = sr.length === '' || sr.length === undefined ? '' : Number(sr.length)
                                      const qty: number | '' = w !== '' && l !== '' && w > 0 && l > 0 ? w * l : sr.quantity
                                      updSubRowMulti(group.id, section.id, sr.id, { width: w, quantity: qty })
                                    }}/>
                                  </td>
                                  <td className="boq-td boq-td-num">
                                    <NumInput className="boq-input boq-input-num" value={sr.length ?? ''} readOnly={rowLocked} onChange={v => {
                                      if (!editing) return
                                      const l = v === '' ? '' : Number(v)
                                      const w = sr.width === '' || sr.width === undefined ? '' : Number(sr.width)
                                      const qty: number | '' = w !== '' && l !== '' && w > 0 && l > 0 ? w * l : sr.quantity
                                      updSubRowMulti(group.id, section.id, sr.id, { length: l, quantity: qty })
                                    }}/>
                                  </td>
                                  {showQtyUnit && (
                                    <>
                                      <td className="boq-td boq-td-num">
                                        <NumInput className="boq-input boq-input-num" value={sr.quantity} readOnly={rowLocked} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'quantity',v)}/>
                                      </td>
                                      <td className="boq-td"><input className="boq-input boq-input-sm" value={sr.unit} readOnly={rowLocked} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'unit',e.target.value)}/></td>
                                    </>
                                  )}
                                  {showMat && !matDetailHidden && (
                                    <>
                                      <td className="boq-td boq-td-num">
                                        <NumInput className="boq-input boq-input-num" value={sr.materialPrice} readOnly={rowLocked} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'materialPrice',v)}/>
                                      </td>
                                      <td className="boq-td boq-td-num boq-td-calc">
                                        {editing ? (
                                          <NumInput
                                            className="boq-input boq-input-num"
                                            value={calcMat(sr)}
                                            readOnly={rowLocked}
                                            blankZero={true}
                                            onChange={v => editing && updLineAmount(group.id, section.id, sr.id, 'material', v)}
                                          />
                                        ) : (
                                          fmt(calcMat(sr))
                                        )}
                                      </td>
                                    </>
                                  )}
                                  {showMat && matDetailHidden && <td className="boq-td boq-td-mat-collapsed-slot" aria-hidden />}
                                  {showLabor && (
                                    <>
                                      <td className="boq-td boq-td-num">
                                        <NumInput className="boq-input boq-input-num" value={sr.laborPrice} readOnly={rowLocked} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'laborPrice',v)}/>
                                      </td>
                                      <td className="boq-td boq-td-num boq-td-calc">
                                        {editing ? (
                                          <NumInput
                                            className="boq-input boq-input-num"
                                            value={calcLab(sr)}
                                            readOnly={rowLocked}
                                            blankZero={true}
                                            onChange={v => editing && updLineAmount(group.id, section.id, sr.id, 'labor', v)}
                                          />
                                        ) : (
                                          fmt(calcLab(sr))
                                        )}
                                      </td>
                                    </>
                                  )}
                                  {tableShowTotal && (
                                    actualCompareMode ? (
                                      <>
                                        <td className="boq-td boq-td-num boq-td-calc boq-td--plan-mirror">{fmt(planSr ? calcRowMoneyTotal(planSr) : calcRowMoneyTotal(sr))}</td>
                                        <td className="boq-td boq-td-num">
                                          <NumInput className="boq-input boq-input-num" value={sr.workDecrease ?? ''} readOnly={!editing}
                                            onChange={v => editing && updSubRow(group.id, section.id, sr.id, 'workDecrease', v)} />
                                        </td>
                                        <td className="boq-td boq-td-num">
                                          <NumInput className="boq-input boq-input-num" value={sr.workIncrease ?? ''} readOnly={!editing}
                                            onChange={v => editing && updSubRow(group.id, section.id, sr.id, 'workIncrease', v)} />
                                        </td>
                                        <td className="boq-td boq-td-num boq-td-total">{fmt(calcAdjustedLineTotal(sr))}</td>
                                      </>
                                    ) : (
                                      <td className="boq-td boq-td-num boq-td-total">{fmt(calcRowMoneyTotal(sr))}</td>
                                    )
                                  )}
                                  <td className="boq-td boq-td-action">
                                    {canMutateStructure && (
                                      <div className="boq-action-cell">
                                        {depth === 0 && i === 0 && (
                                          <>
                                            <button type="button" className="boq-btn boq-action-btn-section-del"
                                              onClick={() => askConfirm(`ลบข้อ ${globalNum} "${section.title||'ไม่มีชื่อ'}" ?`, () => { delSection(group.id, section.id); setConfirm(null) })}
                                              title="ลบข้อนี้">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                                              </svg>
                                            </button>
                                            <button type="button" className="boq-btn boq-action-btn-add" onClick={() => addSubRow(group.id,section.id)} title="เพิ่มรายการย่อย (1.2, 1.3…)">
                                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                              </svg>
                                            </button>
                                          </>
                                        )}
                                        <button type="button" className="boq-btn boq-action-btn-add-nested" onClick={() => addNestedSubRow(group.id,section.id,sr.id)} title="เพิ่มระดับถัดไป (เช่น 1.1.1)">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                          </svg>
                                        </button>
                                        <button type="button" className="boq-btn boq-action-btn-del-row"
                                          onClick={() => askConfirm('ลบแถวนี้?', () => { delSubRow(group.id, section.id, sr.id); setConfirm(null) })}
                                          title="ลบแถวนี้">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                          </svg>
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="boq-td boq-td-note">
                                    <AutoTextarea className="boq-input boq-textarea" value={sr.note} readOnly={!editing}
                                      onChange={v => editing && updSubRow(group.id,section.id,sr.id,'note',v)} />
                                  </td>
                                  {tableShowSecDiscount && <DiscountCells rowTotal={rowTotal} discountShare={rowDiscountShare} pct={rowPct} />}
                                  {planCells}
                                  {actCells}
                                </tr>,
                                ...renderBoqLines(sr.children ?? [], displayNo, depth + 1),
                              ]
                            })
                          return renderBoqLines(section.subRows, String(globalNum), 0)
                        })()}
                      </React.Fragment>
                    )
                  })}
                  {colVis.showDesc && (
                    <>
                      <SummaryRow
                        label={`รวม${group.title||`หมวดงานที่ ${groupIdx+1}`} ข้อ ${groupStartSec}${groupStartSec!==groupEndSec?`–${groupEndSec}`:''}`}
                        amount={fmt(groupTotal)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode}
                        actualFourCols={groupSummaryFour}
                        discountCells={tableShowSecDiscount ? <DiscountCells rowTotal={groupTotal} discountShare={groupDiscountAlloc[groupIdx] ?? 0} pct={grandTotal > 0 ? (groupTotal / grandTotal) * 100 : 0} /> : undefined}
                        extraCells={<>{planGroupSummaryCells}{actGroupSummaryCells}</>}
                      />
                    </>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <SummaryRow
              label={`รวมรายการ ข้อ 1 - ${totalItems}`}
              amount={fmt(grandTotal)}
              highlight={true}
              vis={colVis}
              actualMoneyTail4={actualCompareMode}
              actualFourCols={
                actualCompareMode
                  ? {
                      plan: fmt(grandPlanBase),
                      dec: fmt(grandWorkAdj.dec),
                      inc: fmt(grandWorkAdj.inc),
                      adj: fmt(grandTotal),
                    }
                  : undefined
              }
              discountCells={emptyDiscCells}
            />
            <SummaryRow
              label={
                editing ? (
                  <span className="boq-summary-editable-label">
                    ค่าดำเนินการ&nbsp;
                    <input
                      type="text" inputMode="decimal"
                      className="boq-summary-pct-input"
                      value={overheadPct}
                      onChange={e => setOverheadPct(parseFloat(e.target.value)||0)}
                    />
                    &nbsp;%
                  </span>
                ) : `ค่าดำเนินการ ${overheadPct}%`
              }
              amount={fmt(overhead)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} discountCells={emptyDiscCells} />
            <SummaryRow label="ราคารวมค่าดำเนินการ" amount={fmt(subtotalBeforeDiscount)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} discountCells={emptyDiscCells} />
            <SummaryRow
              label={
                <span className="boq-summary-editable-label">
                  ส่วนลดพิเศษ
                  {editing && (
                    <span className="boq-discount-type-toggle">
                      <button
                        type="button"
                        className={`boq-dtype-btn${discountType==='amount'?' boq-dtype-btn--active':''}`}
                        onClick={() => setDiscountType('amount')}
                      >฿</button>
                      <button
                        type="button"
                        className={`boq-dtype-btn${discountType==='pct'?' boq-dtype-btn--active':''}`}
                        onClick={() => setDiscountType('pct')}
                      >%</button>
                    </span>
                  )}
                  {editing && discountType === 'pct' && (
                    <NumInput
                      className="boq-summary-pct-input"
                      value={discount}
                      onChange={v => setDiscount(v)}
                    />
                  )}
                  {!editing && discountType==='pct' && ` ${discountNum}%`}
                </span>
              }
              amount={fmt(discountAmt)}
              highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode}
              editNode={
                editing && discountType === 'amount' ? (
                  <NumInput
                    className="boq-summary-discount-input"
                    value={discount}
                    onChange={v => setDiscount(v)}
                  />
                ) : undefined
              }
              discountCells={emptyDiscCells}
            />
            <SummaryRow label="ราคารวมหลังหักส่วนลด" amount={fmt(afterDiscount)} highlight={true} vis={colVis} actualMoneyTail4={actualCompareMode} discountCells={emptyDiscCells} />
            <SummaryRow
              label={
                editing ? (
                  <span className="boq-summary-editable-label">
                    ภาษีมูลค่าเพิ่ม&nbsp;
                    <input
                      type="text" inputMode="decimal"
                      className="boq-summary-pct-input"
                      value={vatPct}
                      onChange={e => setVatPct(parseFloat(e.target.value)||0)}
                    />
                    &nbsp;%
                  </span>
                ) : `ภาษีมูลค่าเพิ่ม ${vatPct}%`
              }
              amount={fmt(vat)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} discountCells={emptyDiscCells} />
            <SummaryRow label="ราคารวมภาษีมูลค่าเพิ่ม" amount={fmt(totalWithVat)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} discountCells={emptyDiscCells} />
          </tfoot>
        </table>
      </div>
      {boqKind === 'PLAN' && planSideEditing && (
        <div className="boq-side-panel__actions">
          <button type="button" className="boq-add-row-btn boq-side-add-row-btn" onClick={addPlanRow}>
            + เพิ่มแถวแผนราคา
          </button>
        </div>
      )}
      {boqKind === 'ACTUAL' && actualSideEditing && (
        <div className="boq-side-panel__actions">
          <button type="button" className="boq-add-row-btn boq-side-add-row-btn" onClick={addPlanRow}>
            + เพิ่มแถวทำจริง
          </button>
        </div>
      )}
      </div>


      {confirm && <ConfirmModal message={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
