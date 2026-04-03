'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/hooks/use-user'
import '../../dashboard.css'
import '../boq.css'

const EDITOR_EMAIL = 'bee@cheinproduction.co.th'

/* ── Types ─────────────────────────────────────────────── */
type SubRow = {
  id: string; refPage: string; refCode: string; description: string
  quantity: number | ''; unit: string; materialPrice: number | ''; laborPrice: number | ''; note: string
}
type Section = { id: string; title: string; subRows: SubRow[] }
type Group   = { id: string; title: string; sections: Section[] }

/* ── Helpers ─────────────────────────────────────────────── */
let _uid = 0
const uid = () => String(++_uid)
const emptySubRow = (): SubRow => ({ id: `sr-${uid()}`, refPage: '', refCode: '', description: '', quantity: '', unit: '', materialPrice: '', laborPrice: '', note: '' })
const emptySection = (): Section => { const id = `sec-${uid()}`; return { id, title: '', subRows: [emptySubRow()] } }
const emptyGroup   = (): Group   => ({ id: `grp-${uid()}`, title: '', sections: [emptySection()] })
const calcMat  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.materialPrice)||0)
const calcLab  = (sr: SubRow) => (Number(sr.quantity)||0) * (Number(sr.laborPrice)||0)
const calcRowTotal = (sr: SubRow, mat = true) => (mat ? calcMat(sr) : 0) + calcLab(sr)
const calcGrpTotal = (g: Group, mat = true) => g.sections.flatMap(s => s.subRows).reduce((s, r) => s + calcRowTotal(r, mat), 0)
const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2 })

/* ── Default column widths ─────────────────────────────── */
const DEFAULT_WIDTHS = { no: 60, refPage: 60, refCode: 60, desc: 300, qty: 80, unit: 60, matPrice: 95, matAmt: 95, laborPrice: 95, laborAmt: 95, total: 110, note: 90, action: 82 }
type ColKey = keyof typeof DEFAULT_WIDTHS

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
  const canEdit = user?.email === EDITOR_EMAIL

  const [jobName, setJobName]   = useState('')
  const [jobId, setJobId]       = useState('')
  const [boqTitle, setBoqTitle] = useState('')
  const [jobs, setJobs]         = useState<{ id: string; name: string }[]>([])
  const [boqExists, setBoqExists] = useState(false)
  const [groups, setGroups]     = useState<Group[]>([emptyGroup()])
  const [showMat, setShowMat]   = useState(true)
  const [overheadPct, setOverheadPct]         = useState(12)
  const [vatPct, setVatPct]                   = useState(7)
  const [discount, setDiscount]               = useState<number|''>(0)
  const [discountType, setDiscountType]       = useState<'pct'|'amount'>('amount')
  const [isEditing, setIsEditing] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [saveError, setSaveError] = useState<string|null>(null)
  const [confirm, setConfirm]   = useState<{ msg: string; fn: () => void }|null>(null)

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
          setGroups(isWrapped ? (raw.groups?.length ? raw.groups : [emptyGroup()]) : (Array.isArray(raw) && raw.length ? raw : [emptyGroup()]))
          if (isWrapped) {
            setOverheadPct(raw.overheadPct ?? 12)
            setVatPct(raw.vatPct ?? 7)
            setDiscount(raw.discount ?? 0)
            setDiscountType(raw.discountType ?? 'amount')
          }
          setShowMat(d.boq.showMaterial ?? true)
          setIsEditing(false)
        } else { router.replace('/dashboard/boq') }
      })
      .catch(() => router.replace('/dashboard/boq'))
      .finally(() => setLoading(false))
  }, [id, router])

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

  /* mutations */
  const addGroup    = () => setGroups(p => [...p, emptyGroup()])
  const delGroup    = (gid: string) => setGroups(p => { const f=p.filter(g=>g.id!==gid); return f.length?f:[emptyGroup()] })
  const updGrpTitle = (gid: string, t: string) => setGroups(p => p.map(g => g.id===gid?{...g,title:t}:g))
  const addSection  = (gid: string) => setGroups(p => p.map(g => g.id===gid?{...g,sections:[...g.sections,emptySection()]}:g))
  const delSection  = (gid: string, sid: string) => setGroups(p => p.map(g => { if(g.id!==gid)return g; const f=g.sections.filter(s=>s.id!==sid); return{...g,sections:f.length?f:[emptySection()]} }))
  const updSecTitle = (gid: string, sid: string, t: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id===sid?{...s,title:t}:s)}))
  const addSubRow   = (gid: string, sid: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:[...s.subRows,emptySubRow()]})}))
  const delSubRow   = (gid: string, sid: string, rid: string) => setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>{if(s.id!==sid)return s;const f=s.subRows.filter(r=>r.id!==rid);return{...s,subRows:f.length?f:[emptySubRow()]}})}))
  const updSubRow   = (gid: string, sid: string, rid: string, field: keyof SubRow, val: string|number) =>
    setGroups(p => p.map(g => g.id!==gid?g:{...g,sections:g.sections.map(s=>s.id!==sid?s:{...s,subRows:s.subRows.map(r=>r.id===rid?{...r,[field]:val}:r)})}))

  /* totals */
  const totalItems      = groups.reduce((s,g) => s + g.sections.length, 0)
  const grandTotal      = groups.reduce((s,g) => s+calcGrpTotal(g,showMat), 0)
  const overhead        = grandTotal * (overheadPct || 0) / 100
  const subtotalBeforeDiscount = grandTotal + overhead
  const discountAmt     = discountType === 'pct'
    ? subtotalBeforeDiscount * (Number(discount) || 0) / 100
    : (Number(discount) || 0)
  const afterDiscount   = subtotalBeforeDiscount - discountAmt
  const vat             = afterDiscount * (vatPct || 0) / 100
  const totalWithVat    = afterDiscount + vat
  let globalSecIdx   = 0

  /* colSpan helpers */
  const totalCols      = showMat ? 13 : 11
  const secTitleSpan   = totalCols - 4
  const grpTitleSpan   = totalCols - 2

  const SummaryRow = ({
    label, amount, highlight, editNode,
  }: { label: React.ReactNode; amount: string; highlight: boolean; editNode?: React.ReactNode }) => {
    const hl = highlight ? ' boq-summary-label--highlight' : ''
    return (
      <tr>
        <td className={`boq-td${hl}`}/><td className={`boq-td${hl}`}/><td className={`boq-td${hl}`}/>
        <td className={`boq-td boq-summary-label${hl}`}>{label}</td>
        <td className={`boq-td${hl}`}/><td className={`boq-td${hl}`}/>
        {showMat && <><td className={`boq-td${hl}`}/><td className={`boq-td${hl}`}/></>}
        <td className={`boq-td${hl}`}/>
        <td className={`boq-td boq-td-num boq-summary-dash${hl}`}>-</td>
        <td className={`boq-td boq-td-num boq-summary-amount${hl}`}>
          {editNode ?? amount}
        </td>
        <td className={`boq-td${hl}`}/><td className={`boq-td${hl}`}/>
      </tr>
    )
  }

  /* Resize handle element */
  const RH = ({ col }: { col: ColKey }) => (
    <div className="boq-col-resize" onMouseDown={e => startResize(col, e)} />
  )

  if (loading) return <div className="list-page boq-page"><p style={{ padding:32, color:'#888' }}>กำลังโหลด...</p></div>

  return (
    <div className="list-page boq-page">
      <header className="list-header">
        <div>
          <h1 className="page-title">BOQ</h1>
          <p className="page-subtitle" lang="th">{jobName || 'Bill of Quantities — ไม่ระบุงาน'}</p>
        </div>
        {!canEdit && <span className="boq-readonly-badge">ดูเท่านั้น</span>}
        {canEdit && !isEditing && boqExists && <span className="boq-saved-badge">บันทึกแล้ว</span>}
      </header>

      <div className="boq-top-bar">
        <Link href="/dashboard/boq" className="form-button boq-back-btn">← กลับรายการ BOQ</Link>
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
          jobName && <span className="boq-job-chip">{jobName}</span>
        )}
      </div>

      <div className="boq-table-wrapper">
        <table className="boq-table" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: colW.no }} />
            <col style={{ width: colW.refPage }} />
            <col style={{ width: colW.refCode }} />
            <col style={{ width: colW.desc }} />
            <col style={{ width: colW.qty }} />
            <col style={{ width: colW.unit }} />
            {showMat && <><col style={{ width: colW.matPrice }} /><col style={{ width: colW.matAmt }} /></>}
            <col style={{ width: colW.laborPrice }} />
            <col style={{ width: colW.laborAmt }} />
            <col style={{ width: colW.total }} />
            <col style={{ width: colW.note }} />
            <col style={{ width: colW.action }} />
          </colgroup>

          <thead>
            <tr>
              <th rowSpan={2} className="boq-th boq-th-no">ลำดับที่<RH col="no"/></th>
              <th colSpan={2} className="boq-th">อ้างอิง ID</th>
              <th rowSpan={2} className="boq-th boq-th-desc">รายการ<RH col="desc"/></th>
              <th rowSpan={2} className="boq-th boq-th-qty">จำนวน<RH col="qty"/></th>
              <th rowSpan={2} className="boq-th boq-th-unit">หน่วย<RH col="unit"/></th>
              {showMat && (
                <th colSpan={2} className="boq-th boq-th-has-toggle">
                  <button type="button" className="boq-material-toggle-btn" onClick={() => setShowMat(false)} title="ซ่อนค่าวัสดุ">−</button>
                  ราคาวัสดุสิ่งก่อสร้าง
                </th>
              )}
              <th colSpan={2} className={!showMat ? 'boq-th boq-th-has-toggle' : 'boq-th'}>
                {!showMat && <button type="button" className="boq-material-toggle-btn" onClick={() => setShowMat(true)} title="แสดงค่าวัสดุ">+</button>}
                {showMat ? 'ค่าแรงงาน' : 'ค่าแรงงาน+ค่าวัสดุ'}
              </th>
              <th rowSpan={2} className="boq-th boq-th-total">ค่าวัสดุ<br/>และแรงงาน<RH col="total"/></th>
              <th rowSpan={2} className="boq-th boq-th-note">หมายเหตุ<RH col="note"/></th>
              <th rowSpan={2} className="boq-th boq-th-action"><RH col="action"/></th>
            </tr>
            <tr>
              <th className="boq-th boq-th-sub">เลขหน้า<RH col="refPage"/></th>
              <th className="boq-th boq-th-sub">รหัส<RH col="refCode"/></th>
              {showMat && (<>
                <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="matPrice"/></th>
                <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="matAmt"/></th>
              </>)}
              <th className="boq-th boq-th-sub">ราคาต่อหน่วย<RH col="laborPrice"/></th>
              <th className="boq-th boq-th-sub">จำนวนเงิน<RH col="laborAmt"/></th>
            </tr>
          </thead>

          <tbody>
            {groups.map((group, groupIdx) => {
              const groupStartSec = globalSecIdx + 1
              globalSecIdx += group.sections.length
              const groupEndSec = globalSecIdx
              const groupTotal = calcGrpTotal(group, showMat)
              return (
                <React.Fragment key={group.id}>
                  <tr className="boq-group-header-row">
                    <td className="boq-td boq-td-group-no">{groupIdx + 1}</td>
                    <td colSpan={grpTitleSpan} className="boq-td boq-td-group-title-cell">
                      <input className="boq-input boq-input-group-title" value={group.title} readOnly={!editing}
                        onChange={e => editing && updGrpTitle(group.id, e.target.value)}
                        placeholder={`หมวดงานที่ ${groupIdx+1} — พิมพ์ชื่อหมวดงาน`} />
                    </td>
                    <td className="boq-td boq-td-action">
                      {editing && (
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

                  {group.sections.map((section, secIdx) => {
                    const globalNum = groupStartSec + secIdx
                    return (
                      <React.Fragment key={section.id}>
                        <tr className="boq-section-header-row">
                          <td className="boq-td boq-td-no boq-td-section-no">{globalNum}</td>
                          <td className="boq-td"/><td className="boq-td"/>
                          <td colSpan={secTitleSpan} className="boq-td boq-td-section-title-cell">
                            <input className="boq-input boq-input-section-title" value={section.title} readOnly={!editing}
                              onChange={e => editing && updSecTitle(group.id, section.id, e.target.value)}
                              placeholder={`ข้อ ${globalNum} — พิมพ์ชื่อข้อ`} />
                          </td>
                          <td className="boq-td boq-td-action"/>
                        </tr>

                        {section.subRows.map((sr, srIdx) => (
                          <tr key={sr.id} className="boq-row">
                            <td className="boq-td boq-td-no boq-td-sub-no">{globalNum}.{srIdx+1}</td>
                            <td className="boq-td"><input className="boq-input" value={sr.refPage} readOnly={!editing} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'refPage',e.target.value)}/></td>
                            <td className="boq-td"><input className="boq-input" value={sr.refCode} readOnly={!editing} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'refCode',e.target.value)}/></td>
                            <td className="boq-td boq-td-desc">
                              <AutoTextarea className="boq-input boq-textarea" value={sr.description} readOnly={!editing}
                                onChange={v => editing && updSubRow(group.id,section.id,sr.id,'description',v)}
                                placeholder={editing ? `รายการที่ ${globalNum}.${srIdx+1}` : ''} />
                            </td>
                            <td className="boq-td boq-td-num">
                              <NumInput className="boq-input boq-input-num" value={sr.quantity} readOnly={!editing} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'quantity',v)}/>
                            </td>
                            <td className="boq-td"><input className="boq-input boq-input-sm" value={sr.unit} readOnly={!editing} onChange={e=>editing&&updSubRow(group.id,section.id,sr.id,'unit',e.target.value)}/></td>
                            {showMat && (
                              <>
                                <td className="boq-td boq-td-num">
                                  <NumInput className="boq-input boq-input-num" value={sr.materialPrice} readOnly={!editing} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'materialPrice',v)}/>
                                </td>
                                <td className="boq-td boq-td-num boq-td-calc">{fmt(calcMat(sr))}</td>
                              </>
                            )}
                            <td className="boq-td boq-td-num">
                              <NumInput className="boq-input boq-input-num" value={sr.laborPrice} readOnly={!editing} onChange={v=>editing&&updSubRow(group.id,section.id,sr.id,'laborPrice',v)}/>
                            </td>
                            <td className="boq-td boq-td-num boq-td-calc">{fmt(calcLab(sr))}</td>
                            <td className="boq-td boq-td-num boq-td-total">{fmt(calcRowTotal(sr,showMat))}</td>
                            <td className="boq-td boq-td-note">
                              <AutoTextarea className="boq-input boq-textarea" value={sr.note} readOnly={!editing}
                                onChange={v => editing && updSubRow(group.id,section.id,sr.id,'note',v)} />
                            </td>
                            <td className="boq-td boq-td-action">
                              {editing && (
                                <div className="boq-action-cell">
                                  {srIdx === 0 && (
                                    <>
                                      <button type="button" className="boq-btn boq-action-btn-section-del" disabled={group.sections.length<=1}
                                        onClick={() => askConfirm(`ลบข้อ ${globalNum} "${section.title||'ไม่มีชื่อ'}" ?`, () => delSection(group.id,section.id))}
                                        title="ลบข้อนี้">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                          <line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
                                        </svg>
                                      </button>
                                      <button type="button" className="boq-btn boq-action-btn-add" onClick={() => addSubRow(group.id,section.id)} title="เพิ่มรายการย่อย">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                        </svg>
                                      </button>
                                    </>
                                  )}
                                  <button type="button" className="boq-btn boq-action-btn-del-row" disabled={section.subRows.length<=1}
                                    onClick={() => askConfirm('ลบแถวนี้?', () => delSubRow(group.id,section.id,sr.id))}
                                    title="ลบแถวนี้">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    )
                  })}
                  <SummaryRow
                    label={`รวม${group.title||`หมวดงานที่ ${groupIdx+1}`} ข้อ ${groupStartSec}${groupStartSec!==groupEndSec?`–${groupEndSec}`:''}`}
                    amount={fmt(groupTotal)} highlight={false} />
                </React.Fragment>
              )
            })}
          </tbody>

          <tfoot>
            <SummaryRow label={`รวมรายการ ${totalItems} ข้อ`} amount={fmt(grandTotal)} highlight={true}/>
            <SummaryRow
              label={
                editing ? (
                  <span className="boq-summary-editable-label">
                    ค่าดำเนินการ&nbsp;
                    <input
                      type="number" min={0} max={100} step={0.01}
                      className="boq-summary-pct-input"
                      value={overheadPct}
                      onChange={e => setOverheadPct(parseFloat(e.target.value)||0)}
                    />
                    &nbsp;%
                  </span>
                ) : `ค่าดำเนินการ ${overheadPct}%`
              }
              amount={fmt(overhead)} highlight={false}
            />
            <SummaryRow
              label={
                <span className="boq-summary-editable-label">
                  ส่วนลดพิเศษ
                  {(editing || !editing) && (
                    <span className="boq-discount-type-toggle">
                      <button
                        type="button"
                        className={`boq-dtype-btn${discountType==='amount'?' boq-dtype-btn--active':''}`}
                        onClick={() => editing && setDiscountType('amount')}
                        style={!editing ? { pointerEvents: 'none' } : undefined}
                      >฿</button>
                      <button
                        type="button"
                        className={`boq-dtype-btn${discountType==='pct'?' boq-dtype-btn--active':''}`}
                        onClick={() => editing && setDiscountType('pct')}
                        style={!editing ? { pointerEvents: 'none' } : undefined}
                      >%</button>
                    </span>
                  )}
                  {/* when % mode and editing, show the % input in the label */}
                  {editing && discountType === 'pct' && (
                    <input
                      type="number" min={0} max={100} step={0.01}
                      className="boq-summary-pct-input"
                      value={discount}
                      onChange={e => setDiscount(e.target.value === '' ? '' : parseFloat(e.target.value)||0)}
                      placeholder="0"
                    />
                  )}
                  {!editing && discountType==='pct' && ` ${Number(discount)||0}%`}
                </span>
              }
              amount={fmt(discountAmt)}
              highlight={false}
              editNode={
                editing && discountType === 'amount' ? (
                  <input
                    type="number" min={0} step={0.01}
                    className="boq-summary-discount-input"
                    value={discount}
                    onChange={e => setDiscount(e.target.value === '' ? '' : parseFloat(e.target.value)||0)}
                    placeholder="0.00"
                  />
                ) : undefined
              }
            />
            <SummaryRow label="ราคารวมหลังหักส่วนลด" amount={fmt(afterDiscount)} highlight={true}/>
            <SummaryRow
              label={
                editing ? (
                  <span className="boq-summary-editable-label">
                    ภาษีมูลค่าเพิ่ม&nbsp;
                    <input
                      type="number" min={0} max={100} step={0.01}
                      className="boq-summary-pct-input"
                      value={vatPct}
                      onChange={e => setVatPct(parseFloat(e.target.value)||0)}
                    />
                    &nbsp;%
                  </span>
                ) : `ภาษีมูลค่าเพิ่ม ${vatPct}%`
              }
              amount={fmt(vat)} highlight={false}
            />
            <SummaryRow label="ราคารวมภาษีมูลค่าเพิ่ม" amount={fmt(totalWithVat)} highlight={false}/>
          </tfoot>
        </table>
      </div>

      {canEdit && (
        <div className="boq-actions">
          {editing && <button type="button" className="boq-add-row-btn" onClick={addGroup}>+ เพิ่มหมวดงาน</button>}
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
