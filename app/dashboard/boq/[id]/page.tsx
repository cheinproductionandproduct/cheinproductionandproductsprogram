'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import { canDeleteBoq, canEditBoq, canSubmitBoq, canSignBoq } from '@/lib/auth/permissions'
import '../../dashboard.css'
import '../boq.css'

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
const calcMat  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.materialPrice)||0)
const calcLab  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.laborPrice)||0)
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

function normalizeSubRow(r: SubRow & { children?: SubRow[] }): SubRow {
  const kids = Array.isArray(r.children) ? r.children.map(normalizeSubRow) : []
  return {
    ...r,
    workDecrease: r.workDecrease ?? '',
    workIncrease: r.workIncrease ?? '',
    children: kids,
  }
}

/** Line total from approved plan row (for Actual compare mode). */
function calcAdjustedLineTotal(sr: SubRow, planRow: SubRow | undefined): number {
  const base = planRow ? calcRowMoneyTotal(planRow) : calcRowMoneyTotal(sr)
  const dec = Number(sr.workDecrease) || 0
  const inc = Number(sr.workIncrease) || 0
  return base - dec + inc
}

function calcRowTreeAdjusted(sr: SubRow, planMap: Map<string, SubRow>): number {
  const pr = planMap.get(sr.id)
  const here = calcAdjustedLineTotal(sr, pr)
  return here + (sr.children ?? []).reduce((s, c) => s + calcRowTreeAdjusted(c, planMap), 0)
}

function calcGrpAdjustedMoneyTotal(g: Group, planMap: Map<string, SubRow>): number {
  return g.sections.flatMap(s => s.subRows).reduce((s, r) => s + calcRowTreeAdjusted(r, planMap), 0)
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

/* ── Default column widths — baseline saved in ../DEFAULTS.md (2026-04-04) ── */
const DEFAULT_WIDTHS = { no: 60, refPage: 60, refCode: 60, desc: 380, qty: 64, unit: 48, matPrice: 95, matAmt: 95, laborPrice: 95, laborAmt: 95, total: 92, action: 72, note: 140 }
type ColKey = keyof typeof DEFAULT_WIDTHS

/** Column visibility (filter). ราคาวัสดุ (4) and ค่าแรงงาน (5) are independent. */
type BoqColVis = {
  showRefId: boolean
  showDesc: boolean
  showQtyUnit: boolean
  showMaterial: boolean
  showLabor: boolean
  showTotal: boolean
  showNote: boolean
}

const BOQ_COL_VIS_DEFAULT: BoqColVis = {
  showRefId: true,
  showDesc: true,
  showQtyUnit: true,
  showMaterial: true,
  showLabor: true,
  showTotal: true,
  showNote: true,
}

function boqMatLabColCount(vis: BoqColVis): number {
  return (vis.showMaterial ? 2 : 0) + (vis.showLabor ? 2 : 0)
}

function boqColVisFilterActive(v: BoqColVis) {
  return (Object.keys(BOQ_COL_VIS_DEFAULT) as (keyof BoqColVis)[]).some(k => v[k] !== BOQ_COL_VIS_DEFAULT[k])
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
function boqTailAfterTitle(vis: BoqColVis): { qty2: boolean; mat2: boolean; lab2: boolean; tot: boolean; note: boolean } {
  if (vis.showDesc) {
    return {
      qty2: vis.showQtyUnit,
      mat2: vis.showMaterial,
      lab2: vis.showLabor,
      tot: vis.showTotal,
      note: vis.showNote,
    }
  }
  if (vis.showQtyUnit) {
    return {
      qty2: false,
      mat2: vis.showMaterial,
      lab2: vis.showLabor,
      tot: vis.showTotal,
      note: vis.showNote,
    }
  }
  if (boqMatLabColCount(vis) > 0) {
    return { qty2: false, mat2: false, lab2: false, tot: vis.showTotal, note: vis.showNote }
  }
  return { qty2: false, mat2: false, lab2: false, tot: false, note: false }
}

/* ── NumInput ─────────────────────────────────────────── */
function NumInput({ value, onChange, className = '', readOnly = false }: { value: number|''; onChange:(v:number|'')=>void; className?:string; readOnly?:boolean }) {
  const [loc, setLoc] = useState<string|null>(null)
  const display = loc !== null ? loc : (value==='' ? '' : fmt(value as number))
  return (
    <input className={className} type="text" inputMode="decimal" value={display} readOnly={readOnly}
      onFocus={() => { if (!readOnly) setLoc(value==='' ? '' : String(value)) }}
      onBlur={e => { if (readOnly) return; const n=parseFloat(e.target.value.replace(/,/g,'')); onChange(isNaN(n)||e.target.value==='' ? '' : n); setLoc(null) }}
      onChange={e => { if (readOnly) return; setLoc(e.target.value); const n=parseFloat(e.target.value.replace(/,/g,'')); if (e.target.value===''||e.target.value==='-') onChange(''); else if (!isNaN(n)) onChange(n) }}
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
  label, amount, highlight, editNode, vis, actualMoneyTail4 = false,
}: { label: React.ReactNode; amount: string; highlight: boolean; editNode?: React.ReactNode; vis: BoqColVis; actualMoneyTail4?: boolean }) {
  const hl = highlight ? ' boq-summary-label--highlight' : ''
  const rowCls = highlight ? 'boq-summary-row boq-summary-row--highlight' : 'boq-summary-row'
  const cellCls = highlight ? ' boq-summary-cell boq-summary-cell--highlight' : ' boq-summary-cell'
  const { showRefId, showDesc, showQtyUnit, showMaterial, showLabor, showTotal, showNote } = vis
  const amountBlock = editNode ?? amount
  const leadSpan = !showDesc ? boqLeadTitleColSpan(vis) : 1
  const tail = boqTailAfterTitle(vis)
  /** รายการ = ข้อความเท่านั้น; ยอดเงินไปคอลัมน์รวม/วัสดุ/แรง — ซ้อนใต้ข้อความเฉพาะเมื่อไม่มีคอลัมน์เงินให้วาง */
  const stackAmountInLabel = !showTotal && !tail.tot && !tail.mat2 && !tail.lab2
  const amountInTotalCol = showTotal
  const amountInMatAmtCol = !showTotal && !showLabor && showMaterial && tail.mat2

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
      {tail.mat2 && (
        <>
          <td className={`boq-td${cellCls}${hl}`}/>
          <td className={`boq-td boq-td-num${cellCls}${hl}${amountInMatAmtCol ? ' boq-summary-amount' : ''}`}>
            {amountInMatAmtCol ? amountBlock : ''}
          </td>
        </>
      )}
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
          <>
            <td className={`boq-td${cellCls}${hl}`} />
            <td className={`boq-td${cellCls}${hl}`} />
            <td className={`boq-td${cellCls}${hl}`} />
            <td className={`boq-td boq-td-num boq-summary-amount${cellCls}${hl}`}>
              {amountInTotalCol ? amountBlock : ''}
            </td>
          </>
        ) : (
          <td className={`boq-td boq-td-num boq-summary-amount${cellCls}${hl}`}>
            {amountInTotalCol ? amountBlock : ''}
          </td>
        )
      )}
      {tail.note && <td className={`boq-td${cellCls}${hl}`}/>}
      <td className={`boq-td${cellCls}${hl}`}/>
    </tr>
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
          <button type="button" className="boq-confirm-ok" onClick={() => { onConfirm(); onCancel() }}>ยืนยันลบ</button>
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
  /** คอลัมน์ราคาวัสดุ — บันทึกเป็น showMaterial */
  const [showMat, setShowMat]   = useState(true)
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

  const handleDeleteBoq = () => {
    askConfirm(`ลบ BOQ "${jobName || boqTitle || 'ไม่ระบุชื่อ'}" ?`, () => {
      askConfirm(`ยืนยันอีกครั้ง: ลบ BOQ นี้ถาวร ?`, async () => {
        setDeleting(true)
        setSaveError(null)
        try {
          const res = await fetch(`/api/boq/${id}`, { method: 'DELETE' })
          const d = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(d.error || 'ลบไม่สำเร็จ')
          router.push('/dashboard/boq')
        } catch (err) {
          setSaveError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ')
          setDeleting(false)
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
          const raw = d.boq.data as (Group[] | { groups: Group[]; overheadPct?: number; vatPct?: number; discount?: number; discountType?: 'pct'|'amount' }) | null
          const isWrapped = raw && !Array.isArray(raw)
          const loaded: Group[] = isWrapped ? (raw.groups?.length ? raw.groups : [emptyGroup()]) : (Array.isArray(raw) && raw.length ? raw as Group[] : [emptyGroup()])
          setGroups(loaded.map(g => ({
            ...g,
            sections: g.sections.map(s => ({ ...s, subRows: s.subRows.map(r => normalizeSubRow(r as SubRow & { children?: SubRow[] })) })),
          })))
          if (isWrapped) {
            setOverheadPct(raw.overheadPct ?? 12)
            setVatPct(raw.vatPct ?? 7)
            setDiscount(raw.discount ?? 0)
            setDiscountType(raw.discountType ?? 'amount')
          }
          setShowMat(d.boq.showMaterial ?? true)
          setBoqKind(d.boq.kind === 'ACTUAL' ? 'ACTUAL' : 'PLAN')
          const pb = d.boq.planBoq as { title?: string; job?: { name?: string } } | null | undefined
          setPlanRefLabel(pb ? (pb.job?.name || pb.title || null) : null)
          setBoqStatus(d.boq.status ?? 'DRAFT')
          setIsEditing(false)

          const planId = d.boq.planBoqId as string | null | undefined
          if (d.boq.kind === 'ACTUAL' && planId) {
            fetch(`/api/boq/${planId}`)
              .then(r => r.json())
              .then((pd: { boq?: { data?: unknown } }) => {
                const praw = pd.boq?.data as (Group[] | { groups: Group[] }) | null | undefined
                if (!praw) {
                  setPlanGroups([])
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
              })
              .catch(() => setPlanGroups([]))
          } else {
            setPlanGroups([])
          }
        } else { router.replace('/dashboard/boq') }
      })
      .catch(() => router.replace('/dashboard/boq'))
      .finally(() => setLoading(false))
  }, [id, router])

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
    try {
      const res = await fetch(`/api/boq/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: { groups, overheadPct, vatPct, discount: Number(discount)||0, discountType },
          showMaterial: showMat, jobId: jobId||null, title: boqTitle,
        }),
      })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setJobName(d.boq?.job?.name || d.boq?.title || '')
      setIsEditing(false)
    } catch { setSaveError('บันทึกไม่สำเร็จ กรุณาลองใหม่') }
    finally { setSaving(false) }
  }

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
  const addNestedSubRow = (gid: string, sid: string, parentRid: string) =>
    setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:addChildSubRow(s.subRows,parentRid,emptySubRow())})}))

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
    showLabor,
    showTotal: tableShowTotal,
    showNote,
  }
  const canMutateStructure = editing && !actualCompareMode

  const grandTotal = useMemo(() => {
    if (actualCompareMode) {
      return groups.reduce((s, g) => s + calcGrpAdjustedMoneyTotal(g, planRowById), 0)
    }
    return groups.reduce((s, g) => s + calcGrpMoneyTotal(g), 0)
  }, [groups, actualCompareMode, planRowById])
  const overhead        = grandTotal * (overheadPct || 0) / 100
  const subtotalBeforeDiscount = grandTotal + overhead
  const discountNum     = Number(discount) || 0
  const discountAmt     = discountType === 'pct'
    ? subtotalBeforeDiscount * discountNum / 100
    : discountNum
  const afterDiscount   = subtotalBeforeDiscount - discountAmt
  const vat             = afterDiscount * (vatPct || 0) / 100
  const totalWithVat    = afterDiscount + vat
  let globalSecIdx   = 0

  /* Resize handle element */
  const RH = ({ col }: { col: ColKey }) => (
    <div className="boq-col-resize" onMouseDown={e => startResize(col, e)} />
  )

  if (loading) return <div className="list-page boq-page"><p style={{ padding:32, color:'#888' }}>กำลังโหลด...</p></div>

  return (
    <div className="list-page boq-page">
      <header className="list-header boq-document-page-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">{jobName || 'Bill of Quantities — ไม่ระบุงาน'}</p>
          <p className="boq-doc-kind-row">
            {boqKind === 'PLAN' ? (
              <span className="boq-doc-kind boq-doc-kind--plan">Plan</span>
            ) : (
              <span className="boq-doc-kind boq-doc-kind--actual">Actual</span>
            )}
            {planRefLabel && (
              <span className="boq-doc-plan-ref">Plan: {planRefLabel}</span>
            )}
          </p>
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
            {jobName && <span className="boq-job-chip">{jobName}</span>}
            {canEdit && !isEditing && boqExists && <span className="boq-saved-badge">บันทึกแล้ว</span>}
            {boqStatus === 'DRAFT' && <span className="boq-status-badge boq-status-draft">ร่าง</span>}
            {boqStatus === 'PENDING' && <span className="boq-status-badge boq-status-pending">รออนุมัติ</span>}
            {boqStatus === 'APPROVED' && <span className="boq-status-badge boq-status-approved">อนุมัติแล้ว</span>}
          </>
        )}
        <div className="boq-top-bar-actions">
          {canSubmit && boqStatus === 'DRAFT' && !isEditing && boqExists && (
            <button type="button" className="boq-submit-btn" onClick={() => askConfirm('ส่ง BOQ นี้ขออนุมัติ?', handleSubmit)} disabled={submitting}>
              {submitting ? 'กำลังส่ง...' : 'ส่งขออนุมัติ'}
            </button>
          )}
          {canSign && boqStatus === 'PENDING' && (
            <button type="button" className="boq-sign-btn" onClick={() => askConfirm('อนุมัติและลงนาม BOQ นี้?', handleSign)} disabled={signing}>
              {signing ? 'กำลังอนุมัติ...' : 'อนุมัติ / ลงนาม'}
            </button>
          )}
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
                <label className="boq-filter-dropdown__option">
                  <input type="checkbox" checked={showLabor} onChange={e => setShowLabor(e.target.checked)} />
                  <span>5. ค่าแรงงาน</span>
                </label>
                <label className="boq-filter-dropdown__option" title={actualCompareMode ? 'Actual ที่ผูกแผนต้องแสดงคอลัมน์นี้ (รวมแผน / งานลด / เพิ่ม)' : undefined}>
                  <input type="checkbox" checked={tableShowTotal} disabled={actualCompareMode} onChange={e => { if (!actualCompareMode) setShowTotal(e.target.checked) }} />
                  <span>6. ค่าวัสดุและแรงงาน</span>
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

      <div className="boq-table-wrapper">
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
            {showMat && (
              <>
                <col style={{ width: colW.matPrice }} />
                <col style={{ width: colW.matAmt }} />
              </>
            )}
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
            {showNote && <col style={{ width: colW.note }} />}
            <col style={{ width: colW.action }} />
          </colgroup>

          <thead>
            <tr>
              <th rowSpan={2} className="boq-th boq-th-no">ลำดับที่<RH col="no"/></th>
              {showRefId && (
                <th colSpan={2} className="boq-th boq-th-ref-head">อ้างอิง ID</th>
              )}
              {tableShowDesc && (
                <th rowSpan={2} className="boq-th boq-th-desc">รายการ<RH col="desc"/></th>
              )}
              {showQtyUnit && (
                <>
                  <th rowSpan={2} className="boq-th boq-th-qty">จำนวน<RH col="qty"/></th>
                  <th rowSpan={2} className="boq-th boq-th-unit">หน่วย<RH col="unit"/></th>
                </>
              )}
              {showMat && (
                <th colSpan={2} className="boq-th">ราคาวัสดุสิ่งก่อสร้าง</th>
              )}
              {showLabor && (
                <th colSpan={2} className="boq-th">ค่าแรงงาน</th>
              )}
              {tableShowTotal && (
                actualCompareMode ? (
                  <>
                    <th rowSpan={2} className="boq-th boq-th-plan-mirror">แผน<br/><span className="boq-th-subhint">(รวม)</span></th>
                    <th rowSpan={2} className="boq-th boq-th-var">งานลด</th>
                    <th rowSpan={2} className="boq-th boq-th-var">งานเพิ่ม</th>
                    <th rowSpan={2} className="boq-th boq-th-total">รวมหลัง<br/>ปรับ<RH col="total"/></th>
                  </>
                ) : (
                  <th rowSpan={2} className="boq-th boq-th-total">ค่าวัสดุ<br/>และแรงงาน<RH col="total"/></th>
                )
              )}
              {showNote && (
                <th rowSpan={2} className="boq-th boq-th-note">หมายเหตุ<RH col="note"/></th>
              )}
              <th rowSpan={2} className="boq-th boq-th-action"><RH col="action"/></th>
            </tr>
            {(showRefId || showMat || showLabor) && (
              <tr>
                {showRefId && (<>
                  <th className="boq-th boq-th-sub">เลขหน้า<RH col="refPage"/></th>
                  <th className="boq-th boq-th-sub">รหัส<RH col="refCode"/></th>
                </>)}
                {showMat && (<>
                  <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="matPrice"/></th>
                  <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="matAmt"/></th>
                </>)}
                {showLabor && (<>
                  <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="laborPrice"/></th>
                  <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="laborAmt"/></th>
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
                ? calcGrpAdjustedMoneyTotal(group, planRowById)
                : calcGrpMoneyTotal(group)
              const rowTail = boqTailAfterTitle(colVis)
              return (
                <React.Fragment key={group.id}>
                  {colVis.showDesc && (
                  <tr className="boq-group-header-row">
                    <td className="boq-td boq-td-group-no">{groupIdx + 1}</td>
                    {showRefId && <><td className="boq-td"/><td className="boq-td"/></>}
                    {!tableShowDesc ? (
                      <td colSpan={boqLeadTitleColSpan(colVis)} className="boq-td boq-td-group-title-cell">
                        <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing || actualCompareMode}
                          onChange={e => editing && updGrpTitle(group.id, e.target.value)}
                          placeholder={`หมวดงานที่ ${groupIdx+1} — พิมพ์ชื่อหมวดงาน`} />
                      </td>
                    ) : (
                      <td className="boq-td boq-td-group-title-cell">
                        <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing || actualCompareMode}
                          onChange={e => editing && updGrpTitle(group.id, e.target.value)}
                          placeholder={`หมวดงานที่ ${groupIdx+1} — พิมพ์ชื่อหมวดงาน`} />
                      </td>
                    )}
                    {rowTail.qty2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.mat2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.lab2 && <><td className="boq-td"/><td className="boq-td"/></>}
                    {rowTail.tot && (actualCompareMode ? <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></> : <td className="boq-td"/>)}
                    {rowTail.note && <td className="boq-td"/>}
                    <td className="boq-td boq-td-action">
                      {canMutateStructure && (
                        <div className="boq-action-cell">
                          <button type="button" className="boq-btn boq-action-btn-section-del" disabled={groups.length<=1}
                            onClick={() => askConfirm(`ลบหมวดงานที่ ${groupIdx+1} "${group.title||'ไม่มีชื่อ'}" ?`, () => delGroup(group.id))}
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
                              <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing || actualCompareMode}
                                onChange={e => editing && updSecTitle(group.id, section.id, e.target.value)}
                                placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                            </td>
                          ) : (
                            <td className="boq-td boq-td-section-title-cell">
                              <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing || actualCompareMode}
                                onChange={e => editing && updSecTitle(group.id, section.id, e.target.value)}
                                placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                            </td>
                          )}
                          {secTail.qty2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.mat2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.lab2 && <><td className="boq-td"/><td className="boq-td"/></>}
                          {secTail.tot && (actualCompareMode ? <><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/><td className="boq-td"/></> : <td className="boq-td"/>)}
                          {secTail.note && <td className="boq-td"/>}
                          <td className="boq-td boq-td-action"/>
                        </tr>
                        )}

                        {(() => {
                          const renderBoqLines = (rows: SubRow[], numPrefix: string, depth: number): React.ReactNode[] =>
                            rows.flatMap((sr, i) => {
                              const displayNo = `${numPrefix}.${i + 1}`
                              const nestedNoCls = depth >= 1 ? ' boq-td-sub-no--nested' : ''
                              const delDisabled = depth === 0 && section.subRows.length <= 1
                              const planSr = planRowById.get(sr.id)
                              const rowLocked = !editing || actualCompareMode
                              const matSrc = actualCompareMode && planSr ? planSr : sr
                              const labSrc = matSrc
                              return [
                                <tr key={sr.id} className="boq-row">
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
                                  {showMat && (
                                    <>
                                      <td className={`boq-td boq-td-num${actualCompareMode ? ' boq-td--plan-mirror' : ''}`}>
                                        <NumInput className="boq-input boq-input-num" value={sr.materialPrice} readOnly={rowLocked} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'materialPrice',v)}/>
                                      </td>
                                      <td className={`boq-td boq-td-num boq-td-calc${actualCompareMode ? ' boq-td--plan-mirror' : ''}`}>{fmt(calcMat(matSrc))}</td>
                                    </>
                                  )}
                                  {showLabor && (
                                    <>
                                      <td className={`boq-td boq-td-num${actualCompareMode ? ' boq-td--plan-mirror' : ''}`}>
                                        <NumInput className="boq-input boq-input-num" value={sr.laborPrice} readOnly={rowLocked} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'laborPrice',v)}/>
                                      </td>
                                      <td className={`boq-td boq-td-num boq-td-calc${actualCompareMode ? ' boq-td--plan-mirror' : ''}`}>{fmt(calcLab(labSrc))}</td>
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
                                        <td className="boq-td boq-td-num boq-td-total">{fmt(calcAdjustedLineTotal(sr, planSr))}</td>
                                      </>
                                    ) : (
                                      <td className="boq-td boq-td-num boq-td-total">{fmt(calcRowMoneyTotal(sr))}</td>
                                    )
                                  )}
                                  {showNote && (
                                    <td className="boq-td boq-td-note">
                                      <AutoTextarea className="boq-input boq-textarea" value={sr.note} readOnly={!editing}
                                        onChange={v => editing && updSubRow(group.id,section.id,sr.id,'note',v)} />
                                    </td>
                                  )}
                                  <td className="boq-td boq-td-action">
                                    {canMutateStructure && (
                                      <div className="boq-action-cell">
                                        {depth === 0 && i === 0 && (
                                          <>
                                            <button type="button" className="boq-btn boq-action-btn-section-del" disabled={group.sections.length<=1}
                                              onClick={() => askConfirm(`ลบข้อ ${globalNum} "${section.title||'ไม่มีชื่อ'}" ?`, () => delSection(group.id,section.id))}
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
                                        <button type="button" className="boq-btn boq-action-btn-del-row" disabled={delDisabled}
                                          onClick={() => askConfirm('ลบแถวนี้?', () => delSubRow(group.id,section.id,sr.id))}
                                          title="ลบแถวนี้">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                          </svg>
                                        </button>
                                      </div>
                                    )}
                                  </td>
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
                    <SummaryRow
                      label={`รวม${group.title||`หมวดงานที่ ${groupIdx+1}`} ข้อ ${groupStartSec}${groupStartSec!==groupEndSec?`–${groupEndSec}`:''}`}
                      amount={fmt(groupTotal)} highlight={false} vis={colVis} actualMoneyTail4={actualCompareMode} />
                  )}
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <SummaryRow label={`รวมรายการ ข้อ 1 - ${totalItems}`} amount={fmt(grandTotal)} highlight={true} vis={colVis} actualMoneyTail4={actualCompareMode} />
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

      {canEdit && (
        <div className="boq-actions">
          {canMutateStructure && <button type="button" className="boq-add-row-btn" onClick={addGroup}>+ เพิ่มหมวดงาน</button>}
          {editing ? (
            <button type="button" className="boq-save-btn" onClick={handleSave} disabled={saving}>
              {saving ? 'กำลังบันทึก...' : '💾 บันทึก'}
            </button>
          ) : (
            <button type="button" className="boq-edit-btn" onClick={() => setIsEditing(true)}>✏️ แก้ไข</button>
          )}
          {saveError && <span className="boq-save-error">{saveError}</span>}
        </div>
      )}

      {confirm && <ConfirmModal message={confirm.msg} onConfirm={confirm.fn} onCancel={() => setConfirm(null)} />}
    </div>
  )
}
