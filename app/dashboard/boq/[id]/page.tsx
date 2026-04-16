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
const DEFAULT_WIDTHS = { no: 60, refPage: 60, refCode: 60, desc: 380, qty: 64, unit: 48, matPrice: 110, matAmt: 115, laborPrice: 110, laborAmt: 115, total: 120, action: 100, secDiscount: 120, secNet: 130, note: 140 }
type ColKey = keyof typeof DEFAULT_WIDTHS

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

/** Colspan for group/section title when รายการ is hidden (covers the next visible data columns). */
function boqLeadTitleColSpan(vis: BoqColVis): number {
  if (vis.showDesc) return 1
  if (vis.showQtyUnit) return 2
  const ml = boqMatLabColCount(vis)
  if (ml > 0) return ml
  let n = 0
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

/** Colspan: รายการ + tail through รวม — wide cell for per-group discount strip. */
function boqGroupDiscountWideColSpan(vis: BoqColVis, actualMoneyTail4: boolean): number {
  if (!vis.showDesc) return 0
  return 1 + boqSummaryTailColumnCount(vis, actualMoneyTail4)
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
  label, amount, highlight, editNode, vis, actualMoneyTail4 = false, actualFourCols,
}: {
  label: React.ReactNode
  amount: string
  highlight: boolean
  editNode?: React.ReactNode
  vis: BoqColVis
  actualMoneyTail4?: boolean
  /** When Actual vs plan: show แผน / งานลด / งานเพิ่ม / รวมหลังปรับ in the four total columns (group & grand rows). */
  actualFourCols?: { plan: string; dec: string; inc: string; adj: string }
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
      {/* action | ส่วนลดแต่ละข้อ | ยอดงานหลังส่วนลด */}
      <td className={`boq-td${cellCls}${hl}`}/>
      <td className={`boq-td boq-td-sec-discount${cellCls}${hl}`}/>
      <td className={`boq-td${cellCls}${hl}`}/>
      {tail.note && <td className={`boq-td${cellCls}${hl}`}/>}
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
  discountAmt: number,
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
      if (discountAmt > 0 && tableShowTotal) slots.push({ kind: 'sectionDiscount', key: `sd-${sec.id}` })
    }
    const subRowIds = g.sections.flatMap(sec => sec.subRows.map(sr => sr.id))
    slots.push({ kind: 'groupSummary', key: `gs-${g.id}`, subRowIds })
    if (discountAmt > 0 && tableShowTotal) slots.push({ kind: 'groupDiscount', key: `gd-${g.id}` })
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
        {ro ? (
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
        {ro ? (
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
        <col className="boq-side-col" />
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
  const filterDocWrapRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<{ past: EditorSnapshot[]; future: EditorSnapshot[] }>({ past: [], future: [] })
  const isApplyingHistoryRef = useRef(false)
  const mainTheadRef = useRef<HTMLTableSectionElement>(null)
  const mainTbodyRef = useRef<HTMLTableSectionElement>(null)
  const planTriplexTbodyRef = useRef<HTMLTableSectionElement>(null)
  const actualTriplexTbodyRef = useRef<HTMLTableSectionElement>(null)
  const boqSplitScrollRef = useRef<HTMLDivElement>(null)
  const [historyTick, setHistoryTick] = useState(0)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle'|'pending'|'saving'|'saved'|'error'>('idle')
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Column widths */
  const [colW, setColW] = useState<typeof DEFAULT_WIDTHS>({ ...DEFAULT_WIDTHS })
  const resizing = useRef<{ key: ColKey; startX: number; startW: number }|null>(null)

  const startResize = useCallback((key: ColKey, e: React.MouseEvent) => {
    e.preventDefault()
    resizing.current = { key, startX: e.clientX, startW: colW[key] }
    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return
      const { key: k, startX, startW } = resizing.current
      setColW(p => ({ ...p, [k]: Math.max(40, startW + ev.clientX - startX) }))
    }
    const onUp = () => { resizing.current = null; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [colW])

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
    }, 30_000)
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

  const handleExportClean = () => {
    const pageEl = document.querySelector('.boq-page') as HTMLElement | null
    if (!pageEl) return

    const clone = pageEl.cloneNode(true) as HTMLElement

    // Remove interactive UI / controls
    clone.querySelectorAll(
      '.boq-top-bar, .boq-actions, .boq-modal-overlay, .boq-filter-dropdown, .boq-col-resize, .boq-th-action, .boq-td-action, .boq-side-panel'
    ).forEach(el => el.remove())

    // Remove nested lines like 1.1.1 / 2.3.1 etc.
    clone.querySelectorAll('tr.boq-row--nested').forEach(el => el.remove())

    // Remove action column width from colgroup (last col)
    clone.querySelectorAll('colgroup').forEach(cg => {
      const cols = cg.querySelectorAll('col')
      if (cols.length) cols[cols.length - 1].remove()
    })

    // Convert input-like controls to plain text for clean export
    clone.querySelectorAll('input, textarea, select, button').forEach(el => {
      if (el instanceof HTMLInputElement) {
        const span = document.createElement('span')
        span.textContent = el.type === 'checkbox' ? (el.checked ? '✓' : '') : (el.value || '')
        el.replaceWith(span)
        return
      }
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        const span = document.createElement('span')
        span.textContent = el.value || ''
        el.replaceWith(span)
        return
      }
      el.remove()
    })

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(node => node.outerHTML)
      .join('\n')

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>BOQ Export</title>
    ${styles}
    <style>
      body { margin: 0; padding: 20px; background: #fff; }
      .boq-page { margin: 0 !important; max-width: none !important; }
    </style>
  </head>
  <body>${clone.outerHTML}</body>
</html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 150)
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
          return [...rows, { ...emptyPlanSideRow(), linkedSubRowId: subRowId, [field]: val }]
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
    showNote,
  }
  /** Main BOQ column count — matches `<colgroup>` (for PLAN-style band `colSpan`s). */
  const boqMainTableColCount = useMemo(() => {
    let n = 1
    if (showRefId) n += 2
    if (tableShowDesc) n += 1
    if (showQtyUnit) n += 2
    if (showMat && !matDetailHidden) n += 2
    else if (showMat && matDetailHidden) n += 1
    if (showLabor) n += 2
    if (tableShowTotal) n += actualCompareMode ? 4 : 1
    n += 1  // action
    n += 2  // ส่วนลดแต่ละข้อ + ยอดงานหลังส่วนลด
    if (showNote) n += 1
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
    showNote,
  ])
  const boqMainBandColSpans = useMemo(
    () => planBandColSpansForMain(boqMainTableColCount),
    [boqMainTableColCount],
  )
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
  const vat             = afterDiscount * (vatPct || 0) / 100
  const totalWithVat    = afterDiscount + vat
  /** Per-group share of ส่วนลดพิเศษ by (ยอดหมวด / รวมทุกหมวด) — matches สัดส่วน × ส่วนลดรวม. */
  const groupDiscountAlloc = useMemo(() => {
    const weights = groups.map(g =>
      actualCompareMode ? calcGrpAdjustedMoneyTotal(g) : calcGrpMoneyTotal(g)
    )
    return distributeProportionalAmounts(weights, discountAmt)
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
    () => buildBoqTriplexBodySlots(groups, colVis.showDesc, tableShowTotal, discountAmt),
    [groups, colVis.showDesc, tableShowTotal, discountAmt],
  )
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
  const boqMainTheadSpan = boqMainHeadSubRow ? 3 : 1

  /** Match PLAN/ACTUAL thead row heights to main BOQ so body rows line up across the split. */
  useLayoutEffect(() => {
    const scroll = boqSplitScrollRef.current
    const thead = mainTheadRef.current
    if (!scroll) return
    const clearTheadVars = () => {
      for (let i = 1; i <= 10; i++) scroll.style.removeProperty(`--boq-thead-r${i}-height`)
    }
    if (!thead || thead.rows.length < 1) {
      clearTheadVars()
      return
    }
    const measure = () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rows = Array.from(thead.rows)
          clearTheadVars()
          for (let i = 0; i < rows.length; i++) {
            const h = rows[i].getBoundingClientRect().height
            if (h > 1) scroll.style.setProperty(`--boq-thead-r${i + 1}-height`, `${Math.ceil(h)}px`)
          }
        })
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(thead)
    return () => {
      ro.disconnect()
      clearTheadVars()
    }
  }, [
    boqMainHeadSubRow,
    boqMainTheadSpan,
    loading,
    showRefId,
    showMat,
    matDetailHidden,
    showLabor,
    tableShowDesc,
    showQtyUnit,
    tableShowTotal,
    showNote,
    actualCompareMode,
    colW,
    boqMainTableColCount,
  ])

  /** Triplex: BOQ / PLAN / ACTUAL tbody rows are height-locked in both directions.
   *  Strategy: clear PLAN/ACTUAL forced heights first so each panel's natural
   *  content height is visible, measure all three, apply max to all three.
   *  Only BOQ main tbody + thead are observed — observing PLAN/ACTUAL would
   *  create an infinite loop because clearRows() itself triggers their observer. */
  useLayoutEffect(() => {
    const main = mainTbodyRef.current
    if (!main) return
    const clearRows = (tbody: HTMLTableSectionElement | null) => {
      if (!tbody) return
      Array.from(tbody.rows).forEach(r => r.style.removeProperty('height'))
    }
    let rafId: number | null = null
    let syncing = false
    const scheduleSync = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => { rafId = null; sync() })
    }
    const sync = () => {
      if (syncing) return
      syncing = true
      const pSide = planTriplexTbodyRef.current
      const aSide = actualTriplexTbodyRef.current
      /* Clear PLAN/ACTUAL forced heights so we can measure their natural size */
      clearRows(pSide)
      clearRows(aSide)
      const mRows = Array.from(main.rows)
      const pRows = pSide ? Array.from(pSide.rows) : []
      const aRows = aSide ? Array.from(aSide.rows) : []
      const n = mRows.length
      for (let i = 0; i < n; i++) {
        const bH = Math.ceil(mRows[i].getBoundingClientRect().height)
        const pH = pRows[i] ? Math.ceil(pRows[i].getBoundingClientRect().height) : 0
        const aH = aRows[i] ? Math.ceil(aRows[i].getBoundingClientRect().height) : 0
        const maxH = Math.max(bH, pH, aH)
        if (maxH > 1) {
          if (pRows[i]) pRows[i].style.height = `${maxH}px`
          if (aRows[i]) aRows[i].style.height = `${maxH}px`
          /* Grow the BOQ row only when PLAN/ACTUAL content is taller */
          if (maxH > bH) mRows[i].style.height = `${maxH}px`
        }
      }
      /* Orphan PLAN/ACTUAL rows beyond BOQ count — leave unsized */
      for (let i = n; i < pRows.length; i++) pRows[i].style.removeProperty('height')
      for (let i = n; i < aRows.length; i++) aRows[i].style.removeProperty('height')
      syncing = false
    }
    sync()
    /* Only observe BOQ main tbody and thead — NOT pSide/aSide (would cause loop) */
    const ro = new ResizeObserver(scheduleSync)
    ro.observe(main)
    const mainHead = mainTheadRef.current
    if (mainHead) ro.observe(mainHead)
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      ro.disconnect()
      clearRows(planTriplexTbodyRef.current)
      clearRows(actualTriplexTbodyRef.current)
      Array.from(main.rows).forEach(r => r.style.removeProperty('height'))
    }
  }, [
    groups,
    planSideRows,
    planMirrorSideRows,
    colVis.showDesc,
    tableShowTotal,
    discountAmt,
    boqTriplexBodySlots.length,
    boqKind,
    boqMainHeadSubRow,
    editing,
    loading,
  ])

  let globalSecIdx   = 0

  /* Resize handle element */
  const RH = ({ col }: { col: ColKey }) => (
    <div className="boq-col-resize" onMouseDown={e => startResize(col, e)} />
  )

  /** Discount pair cells: ส่วนลดแต่ละข้อ + ยอดงานหลังส่วนลด */
  const DiscountCells = ({ rowTotal, discountShare }: { rowTotal: number; discountShare: number }) => (
    <>
      <td className="boq-td boq-td-num boq-td-sec-discount">{discountAmt > 0 ? fmt(discountShare) : ''}</td>
      <td className="boq-td boq-td-num boq-td-sec-net">{discountAmt > 0 ? fmt(rowTotal - discountShare) : fmt(rowTotal)}</td>
    </>
  )

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
          <button type="button" className="boq-submit-btn" onClick={handleExportClean}>
            Export
          </button>
          <div className="boq-filter-wrap" ref={filterDocWrapRef}>
            <button
              type="button"
              className={`boq-filter-btn${boqColVisFilterActive(colVis) ? ' boq-filter-btn--active' : ''}`}
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
                  <input type="checkbox" checked={showNote} onChange={e => setShowNote(e.target.checked)} />
                  <span>7. หมายเหตุ</span>
                </label>
                <button type="button" className="boq-filter-dropdown__close" onClick={() => setFilterOpen(false)}>
                  ปิด
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="boq-split-scroll boq-split-scroll--triplex" ref={boqSplitScrollRef}>
      <div className="boq-triplex-row">
      <section className="boq-triplex__panel boq-triplex__panel--boq" aria-labelledby="boq-section-boq-heading">
      <h2 id="boq-section-boq-heading" className="boq-triplex__heading">
        BOQ
      </h2>
      <div className="boq-table-wrapper boq-table-wrapper--triplex">
        <table className="boq-table">
          <colgroup>
            <col style={{ width: colW.no }} />
            {showRefId && (
              <>
                <col style={{ width: colW.refPage }} />
                <col style={{ width: colW.refCode }} />
              </>
            )}
            {tableShowDesc && <col style={{ width: colW.desc }} />}
            {showQtyUnit && (
              <>
                <col style={{ width: colW.qty }} />
                <col style={{ width: colW.unit }} />
              </>
            )}
            {showMat && !matDetailHidden && (
              <>
                <col style={{ width: colW.matPrice }} />
                <col style={{ width: colW.matAmt }} />
              </>
            )}
            {showMat && matDetailHidden && <col style={{ width: 36 }} />}
            {showLabor && (
              <>
                <col style={{ width: colW.laborPrice }} />
                <col style={{ width: colW.laborAmt }} />
              </>
            )}
            {tableShowTotal && (
              actualCompareMode ? (
                <>
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: 88 }} />
                  <col style={{ width: colW.total }} />
                </>
              ) : (
                <col style={{ width: colW.total }} />
              )
            )}
            <col style={{ width: colW.action }} />
            <col style={{ width: colW.secDiscount }} />
            <col style={{ width: colW.secNet }} />
            {showNote && <col style={{ width: colW.note }} />}
          </colgroup>

          <thead ref={mainTheadRef}>
            {boqMainHeadSubRow && boqMainTableColCount >= 3 && (
              <tr className="boq-thead-triplex-band">
                <th colSpan={boqMainBandColSpans[0]} className="boq-th boq-side-th boq-side-th--plan-band" lang="en">
                  <span className="boq-side-th-r1-label">BOQ</span>
                </th>
                <th colSpan={boqMainBandColSpans[1]} className="boq-th boq-side-th boq-side-th--cost-group">
                  <span className="boq-side-th-r1-label" aria-hidden>
                    {'\u00a0'}
                  </span>
                </th>
                <th colSpan={boqMainBandColSpans[2]} className="boq-th boq-side-th boq-side-th--sell-group">
                  <span className="boq-side-th-r1-label" aria-hidden>
                    {'\u00a0'}
                  </span>
                </th>
              </tr>
            )}
            <tr>
              <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-no">ลำดับที่<RH col="no"/></th>
              {showRefId && (
                <th colSpan={2} className="boq-th boq-th-ref-head">อ้างอิง ID</th>
              )}
              {tableShowDesc && (
                <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-desc">รายการ<RH col="desc"/></th>
              )}
              {showQtyUnit && (
                <>
                  <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-qty">จำนวน<RH col="qty"/></th>
                  <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-unit">หน่วย<RH col="unit"/></th>
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
                    <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-total">
                      รวมค่าวัสดุและแรงงาน
                      <RH col="total" />
                    </th>
                  </>
                ) : (
                  <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-total">
                    รวมค่าวัสดุและแรงงาน
                    <RH col="total" />
                  </th>
                )
              )}
              <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-action"><RH col="action"/></th>
              <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-sec-discount">ส่วนลดแต่ละข้อ<RH col="secDiscount"/></th>
              <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-sec-net">ยอดงานหลังส่วนลด<RH col="secNet"/></th>
              {showNote && (
                <th rowSpan={boqMainTheadSpan} className="boq-th boq-th-note">หมายเหตุ<RH col="note"/></th>
              )}
            </tr>
            {(showRefId || (showMat && !matDetailHidden) || showLabor) && (
              <>
                <tr>
                  {showRefId && (<>
                    <th className="boq-th boq-th-sub">เลขหน้า<RH col="refPage"/></th>
                    <th className="boq-th boq-th-sub">รหัส<RH col="refCode"/></th>
                  </>)}
                  {showMat && !matDetailHidden && (<>
                    <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="matPrice"/></th>
                    <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="matAmt"/></th>
                  </>)}
                  {showLabor && (<>
                    <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="laborPrice"/></th>
                    <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="laborAmt"/></th>
                  </>)}
                </tr>
                <tr className="boq-thead-triplex-bridge" aria-hidden>
                  {showRefId && (<>
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                  </>)}
                  {showMat && !matDetailHidden && (<>
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                  </>)}
                  {showLabor && (<>
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                    <th className="boq-th boq-th-sub boq-thead-triplex-bridge-cell" />
                  </>)}
                </tr>
              </>
            )}
          </thead>

          <tbody ref={mainTbodyRef}>
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
                    <DiscountCells rowTotal={groupTotal} discountShare={groupDiscountAlloc[groupIdx] ?? 0} />
                    {rowTail.note && <td className="boq-td"/>}
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
                          {secTail.qty2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.matSlots === 2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.matSlots === 1 && <td className="boq-td"/>}
                          {secTail.lab2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.tot && (actualCompareMode ? <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></> : <td className="boq-td"/>)}
                          <td className="boq-td boq-td-action"/>
                          {(() => { const st = actualCompareMode ? calcSecAdjustedMoneyTotal(section) : calcSecMoneyTotal(section); const sd = grandTotal > 0 ? (st / grandTotal) * discountAmt : 0; return <DiscountCells rowTotal={st} discountShare={sd} /> })()}
                          {secTail.note && <td className="boq-td"/>}
                        </tr>
                        )}

                        {(() => {
                          const renderBoqLines = (rows: SubRow[], numPrefix: string, depth: number): React.ReactNode[] =>
                            rows.flatMap((sr, i) => {
                              const displayNo = `${numPrefix}.${i + 1}`
                              const nestedNoCls = depth >= 1 ? ' boq-td-sub-no--nested' : ''
                              const planSr = planRowById.get(sr.id)
                              const rowLocked = !editing
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
                                  {(() => { const rt = actualCompareMode ? calcRowTreeAdjusted(sr) : calcRowTreeTotal(sr, true); const rd = grandTotal > 0 ? (rt / grandTotal) * discountAmt : 0; return <DiscountCells rowTotal={rt} discountShare={rd} /> })()}
                                  {showNote && (
                                    <td className="boq-td boq-td-note">
                                      <AutoTextarea className="boq-input boq-textarea" value={sr.note} readOnly={!editing}
                                        onChange={v => editing && updSubRow(group.id,section.id,sr.id,'note',v)} />
                                    </td>
                                  )}
                                </tr>,
                                ...renderBoqLines(sr.children ?? [], displayNo, depth + 1),
                              ]
                            })
                          return renderBoqLines(section.subRows, String(globalNum), 0)
                        })()}
                        {colVis.showDesc && discountAmt > 0 && tableShowTotal && (() => {
                          const secTotal = actualCompareMode ? calcSecAdjustedMoneyTotal(section) : calcSecMoneyTotal(section)
                          const secPct = grandTotal > 0 ? (secTotal / grandTotal) * 100 : 0
                          const secDiscount = grandTotal > 0 ? (secTotal / grandTotal) * discountAmt : 0
                          const secNet = secTotal - secDiscount
                          return (
                            <tr className="boq-summary-row boq-summary-row--section-discount">
                              <td className="boq-td boq-summary-cell" />
                              {showRefId && (<><td className="boq-td boq-summary-cell" /><td className="boq-td boq-summary-cell" /></>)}
                              <td
                                colSpan={boqGroupDiscountWideColSpan(colVis, actualCompareMode)}
                                className="boq-td boq-summary-cell boq-group-discount-span-cell"
                              >
                                <div className="boq-section-discount-addon">
                                  <span className="boq-section-discount-addon__title">ข้อ {globalNum} {section.title ? `— ${section.title}` : ''}</span>
                                  <span className="boq-section-discount-addon__item">
                                    <span className="boq-section-discount-addon__label">ยอดรวม</span>
                                    <span className="boq-section-discount-addon__value">{fmt(secTotal)}</span>
                                  </span>
                                  <span className="boq-section-discount-addon__item">
                                    <span className="boq-section-discount-addon__label">สัดส่วน</span>
                                    <span className="boq-section-discount-addon__value">{secPct.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</span>
                                  </span>
                                  <span className="boq-section-discount-addon__item">
                                    <span className="boq-section-discount-addon__label">ส่วนลด</span>
                                    <span className="boq-section-discount-addon__value boq-section-discount-addon__value--discount">−{fmt(secDiscount)}</span>
                                  </span>
                                  <span className="boq-section-discount-addon__item boq-section-discount-addon__item--net">
                                    <span className="boq-section-discount-addon__label">หลังหักส่วนลด</span>
                                    <span className="boq-section-discount-addon__value boq-section-discount-addon__value--net">{fmt(secNet)}</span>
                                  </span>
                                </div>
                              </td>
                              <td className="boq-td boq-summary-cell" />
                              <td className="boq-td boq-summary-cell boq-td-sec-discount" />
                              <td className="boq-td boq-summary-cell" />
                              {showNote && <td className="boq-td boq-summary-cell" />}
                            </tr>
                          )
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
                      />
                      {discountAmt > 0 && tableShowTotal && (
                        <tr className="boq-summary-row boq-summary-row--group-discount">
                          <td className="boq-td boq-summary-cell" />
                          {showRefId && (<><td className="boq-td boq-summary-cell" /><td className="boq-td boq-summary-cell" /></>)}
                          <td
                            colSpan={boqGroupDiscountWideColSpan(colVis, actualCompareMode)}
                            className="boq-td boq-summary-cell boq-group-discount-span-cell"
                          >
                            <div className="boq-group-discount-addon">
                              <div className="boq-group-discount-addon__row">
                                <span className="boq-group-discount-addon__label">สัดส่วนจากยอดรวมหมวด</span>
                                <span className="boq-group-discount-addon__value">
                                  {grandTotal > 0
                                    ? `${((groupTotal / grandTotal) * 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                    : '—'}
                                </span>
                              </div>
                              <div className="boq-group-discount-addon__row">
                                <span className="boq-group-discount-addon__label">ส่วนลดตามสัดส่วน</span>
                                <span className="boq-group-discount-addon__value">{fmt(groupDiscountAlloc[groupIdx] ?? 0)}</span>
                              </div>
                              <div className="boq-group-discount-addon__row boq-group-discount-addon__row--net">
                                <span className="boq-group-discount-addon__label">หลังหักส่วนลด</span>
                                <span className="boq-group-discount-addon__value">{fmt(groupTotal - (groupDiscountAlloc[groupIdx] ?? 0))}</span>
                              </div>
                            </div>
                          </td>
                          <td className="boq-td boq-summary-cell" />
                          <td className="boq-td boq-summary-cell boq-td-sec-discount" />
                          <td className="boq-td boq-summary-cell" />
                          {showNote && <td className="boq-td boq-summary-cell" />}
                        </tr>
                      )}
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
              amount={fmt(overhead)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} />
            <SummaryRow label="ราคารวมค่าดำเนินการ" amount={fmt(subtotalBeforeDiscount)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} />
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
            />
            <SummaryRow label="ราคารวมหลังหักส่วนลด" amount={fmt(afterDiscount)} highlight={true} vis={colVis} actualMoneyTail4={actualCompareMode} />
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
              amount={fmt(vat)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} />
            <SummaryRow label="ราคารวมภาษีมูลค่าเพิ่ม" amount={fmt(totalWithVat)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} />
          </tfoot>
        </table>
      </div>
      </section>

      <section className="boq-triplex__panel boq-triplex__panel--plan" aria-labelledby="boq-section-plan-heading">
        <h2 id="boq-section-plan-heading" className="boq-triplex__heading">
          แผน (Plan)
        </h2>
        <div className="boq-side-panel boq-side-panel--triplex">
          <div className="boq-side-table-wrapper">
            <PlanSidePricingTable
              boqMainHeadSubRow={boqMainHeadSubRow}
              bandLabel="PLAN"
              rows={boqKind === 'ACTUAL' ? planMirrorSideRows : planSideRows}
              footer={boqKind === 'ACTUAL' ? planMirrorFooter : planSideFooter}
              displayNoBySubRowId={boqKind === 'ACTUAL' ? planMirrorDisplayNoBySubRowId : planBoqDisplayNoBySubRowId}
              linkOptions={boqKind === 'ACTUAL' ? planMirrorLinkOptions : planBoqLinkOptions}
              interactive={boqKind === 'PLAN' && planSideEditing}
              onUpdateRow={planRowUpdateForTriplexEditor}
              onDeleteRow={boqKind === 'PLAN' ? delPlanRow : undefined}
              emptyMessage={
                boqKind === 'ACTUAL'
                  ? 'ไม่มีแถวแผนราคาจากแผนที่ผูก'
                  : 'ยังไม่มีแถว — กด แก้ไข แล้วกด + เพิ่มแถวแผนราคา'
              }
              planCostRollupBySubRowId={boqKind === 'ACTUAL' ? mirrorPlanCostRollupBySubRowId : planCostRollupBySubRowId}
              subRowById={boqKind === 'ACTUAL' ? planMirrorSubRowById : subRowById}
              triplex={{
                tbodyRef: planTriplexTbodyRef,
                slots: boqTriplexBodySlots,
                bySubRow: boqKind === 'ACTUAL' ? mirrorBySubRow : planBySubRow,
                orphans: boqKind === 'ACTUAL' ? mirrorOrphans : planOrphans,
                onEnsureRowForSubRow: boqKind === 'PLAN' && planSideEditing ? ensurePlanRowForSubRow : undefined,
              }}
            />
          </div>
          {boqKind === 'PLAN' && planSideEditing && (
            <div className="boq-side-panel__actions">
              <button type="button" className="boq-add-row-btn boq-side-add-row-btn" onClick={addPlanRow}>
                + เพิ่มแถวแผนราคา
              </button>
            </div>
          )}
        </div>
      </section>

      {boqKind === 'ACTUAL' && (
        <section className="boq-triplex__panel boq-triplex__panel--actual" aria-labelledby="boq-section-actual-heading">
          <h2 id="boq-section-actual-heading" className="boq-triplex__heading">
            ทำจริง (Actual)
          </h2>
          <div className="boq-side-panel boq-side-panel--triplex">
            <div className="boq-side-table-wrapper">
              <PlanSidePricingTable
                boqMainHeadSubRow={boqMainHeadSubRow}
                bandLabel="ACTUAL"
                rows={planSideRows}
                footer={planSideFooter}
                displayNoBySubRowId={planBoqDisplayNoBySubRowId}
                linkOptions={planBoqLinkOptions}
                interactive={actualSideEditing}
                onUpdateRow={updPlanRow}
                onDeleteRow={delPlanRow}
                emptyMessage="พร้อมผูกรายการจริง / ใบเสนอราคา (Actual)"
                planCostRollupBySubRowId={planCostRollupBySubRowId}
                subRowById={subRowById}
                triplex={{
                  tbodyRef: actualTriplexTbodyRef,
                  slots: boqTriplexBodySlots,
                  bySubRow: planBySubRow,
                  orphans: planOrphans,
                  onEnsureRowForSubRow: actualSideEditing ? ensurePlanRowForSubRow : undefined,
                }}
              />
            </div>
            {actualSideEditing && (
              <div className="boq-side-panel__actions">
                <button type="button" className="boq-add-row-btn boq-side-add-row-btn" onClick={addPlanRow}>
                  + เพิ่มแถวทำจริง
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      </div>
      </div>

      {confirm && <ConfirmModal message={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
